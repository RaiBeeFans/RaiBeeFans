require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const Stripe = require('stripe');
const Razorpay = require('razorpay');

const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) ? new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
}) : null;

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
const DATA_DIR = path.join(__dirname, 'data');
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
if(!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Simple SQLite via better-sqlite3 (zero config)
const Database = require('better-sqlite3');
const dbFile = path.join(DATA_DIR, 'db.sqlite');
const db = new Database(dbFile);
// Initialize tables
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, email TEXT UNIQUE, password TEXT, role TEXT
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER,
  title TEXT,
  filename TEXT,
  price REAL,
  visibility TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  video_id INTEGER,
  provider TEXT,
  provider_payment_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// Seed demo accounts if not present
const adminExists = db.prepare('SELECT id FROM users WHERE email=?').get('admin@raibee.test');
if(!adminExists){
  const hash = bcrypt.hashSync('DemoPass123', 10);
  db.prepare('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)').run('Rai Bee','admin@raibee.test',hash,'creator');
}
const fanExists = db.prepare('SELECT id FROM users WHERE email=?').get('fan@raibee.test');
if(!fanExists){
  const hash = bcrypt.hashSync('FanPass123', 10);
  db.prepare('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)').run('Fan','fan@raibee.test',hash,'fan');
}

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage });

function authRequired(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({error:'Auth required'});
  const token = auth.split(' ')[1];
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  }catch(err){ return res.status(401).json({error:'Invalid token'}); }
}

app.post('/api/auth/register', async (req,res)=>{
  const {name,email,password,role} = req.body;
  if(!email || !password) return res.status(400).json({error:'email+password required'});
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if(exists) return res.status(400).json({error:'already registered'});
  const hash = await bcrypt.hash(password,10);
  const info = db.prepare('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)').run(name||'', email, hash, role||'fan');
  const user = db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(info.lastInsertRowid);
  const token = jwt.sign(user, JWT_SECRET, {expiresIn:'7d'});
  res.json({user, token});
});

app.post('/api/auth/login', async (req,res)=>{
  const {email,password} = req.body;
  if(!email||!password) return res.status(400).json({error:'email+password required'});
  const user = db.prepare('SELECT id,name,email,password,role FROM users WHERE email=?').get(email);
  if(!user) return res.status(400).json({error:'invalid credentials'});
  const ok = await bcrypt.compare(password, user.password);
  if(!ok) return res.status(400).json({error:'invalid credentials'});
  const safe = { id:user.id, name:user.name, email:user.email, role:user.role };
  const token = jwt.sign(safe, JWT_SECRET, {expiresIn:'7d'});
  res.json({user:safe, token});
});

// Upload video (creator only)
app.post('/api/videos/upload', authRequired, upload.single('file'), (req,res)=>{
  if(req.user.role!=='creator') return res.status(403).json({error:'creator role required'});
  const {title,price,visibility} = req.body;
  const file = req.file;
  if(!file) return res.status(400).json({error:'no file'});
  // Simple server-side encryption of file using AES-256-GCM with env key
  const ENC_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef'; // 32 bytes hex or fallback
  const key = Buffer.from(ENC_KEY.length===32 ? ENC_KEY : ENC_KEY, 'utf8').slice(0,32);
  const iv = crypto.randomBytes(12);
  const input = fs.readFileSync(file.path);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  const outName = file.filename + '.enc';
  fs.writeFileSync(path.join(UPLOAD_DIR, outName), Buffer.concat([iv, tag, encrypted]));
  // remove original
  fs.unlinkSync(file.path);
  const owner_id = req.user.id;
  const info = db.prepare('INSERT INTO videos (owner_id,title,filename,price,visibility) VALUES (?,?,?,?,?)').run(owner_id,title||file.originalname, outName, price||0, visibility||'subscribers');
  const vid = db.prepare('SELECT * FROM videos WHERE id=?').get(info.lastInsertRowid);
  res.json({video:vid});
});

// List videos (public info)
app.get('/api/videos', (req,res)=>{
  const vids = db.prepare('SELECT v.*, u.email as owner_email, u.name as owner_name FROM videos v JOIN users u ON u.id=v.owner_id ORDER BY v.created_at DESC').all();
  res.json({videos:vids});
});

// Generate signed temporary playback URL (simple implementation)
app.get('/api/videos/watch/:id', authRequired, (req,res)=>{
  const vid = db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id);
  if(!vid) return res.status(404).json({error:'not found'});
  // Check access: public, owner, or purchase exists, or subscriber (simplified: if any purchase exists)
  if(vid.visibility==='public' || vid.owner_id===req.user.id){
    // allowed
  } else {
    const p = db.prepare('SELECT id FROM purchases WHERE user_id=? AND video_id=?').get(req.user.id, vid.id);
    if(!p) return res.status(403).json({error:'purchase or subscription required'});
  }
  // Return a route that streams the decrypted file if authorized
  const tokenPayload = { videoId: vid.id, userId: req.user.id, exp: Math.floor(Date.now()/1000)+60*5 }; // 5 min
  const playToken = jwt.sign(tokenPayload, JWT_SECRET);
  res.json({playUrl:`/api/videos/stream/${vid.id}?t=${playToken}`, watermark: `${req.user.name} • Rai Bee Exclusive`});
});

// Stream endpoint: validate play token then decrypt and stream
app.get('/api/videos/stream/:id', (req,res)=>{
  const t = req.query.t;
  if(!t) return res.status(401).json({error:'token required'});
  try{
    const payload = jwt.verify(t, JWT_SECRET);
    // ok
  }catch(err){ return res.status(401).json({error:'invalid token'}); }
  const vid = db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id);
  if(!vid) return res.status(404).json({error:'not found'});
  const filePath = path.join(UPLOAD_DIR, vid.filename);
  if(!fs.existsSync(filePath)) return res.status(404).json({error:'file missing'});
  // read iv(12) + tag(16) + encrypted
  const buf = fs.readFileSync(filePath);
  const iv = buf.slice(0,12);
  const tag = buf.slice(12,28);
  const data = buf.slice(28);
  const ENC_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
  const key = Buffer.from(ENC_KEY.length===32 ? ENC_KEY : ENC_KEY, 'utf8').slice(0,32);
  try{
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    res.setHeader('Content-Type','video/mp4');
    res.setHeader('Cache-Control','no-cache, no-store');
    return res.send(out);
  }catch(err){ console.error(err); return res.status(500).json({error:'decryption failed'}); }
});

// Purchase endpoints
app.post('/api/pay/stripe/create-session', authRequired, async (req,res)=>{
  if(!stripe) return res.status(500).json({error:'stripe not configured'});
  const {videoId} = req.body;
  const vid = db.prepare('SELECT * FROM videos WHERE id=?').get(videoId);
  if(!vid) return res.status(404).json({error:'video not found'});
  const session = await stripe.checkout.sessions.create({
    payment_method_types:['card'],
    mode:'payment',
    line_items:[{price_data:{currency:'inr',product_data:{name:vid.title},unit_amount: Math.round((vid.price||0)*100)},quantity:1}],
    success_url: (process.env.FRONTEND_URL||'http://localhost:3000') + '/purchase-success?videoId='+vid.id,
    cancel_url: (process.env.FRONTEND_URL||'http://localhost:3000') + '/purchase-cancel'
  });
  res.json({id:session.id});
});

// Simple webhook handlers to record purchases (for demo only)
app.post('/api/webhook/stripe', bodyParser.raw({type:'application/json'}), (req,res)=>{
  // NOTE: In production verify signature using STRIPE_WEBHOOK_SECRET
  // For demo, accept event and create purchase if checkout.session.completed
  let event;
  try{ event = JSON.parse(req.body.toString()); }catch(e){ return res.status(400).end(); }
  if(event.type==='checkout.session.completed'){
    // Not safe to rely on this alone for production
    // You would map session to order and record purchase.
    console.log('stripe checkout completed', event);
  }
  res.json({received:true});
});

// Razorpay order creation
app.post('/api/pay/razorpay/create-order', authRequired, async (req,res)=>{
  if(!razorpay) return res.status(500).json({error:'razorpay not configured'});
  const {videoId} = req.body;
  const vid = db.prepare('SELECT * FROM videos WHERE id=?').get(videoId);
  if(!vid) return res.status(404).json({error:'video not found'});
  const options = {
    amount: Math.round((vid.price||0)*100),
    currency: "INR",
    receipt: "rcpt_"+Date.now()
  };
  try{
    const order = await razorpay.orders.create(options);
    res.json({order});
  }catch(err){ console.error(err); res.status(500).json({error:'razorpay error'}); }
});

// UPI deep link + QR generation
app.post('/api/pay/upi/create', authRequired, async (req,res)=>{
  // Accept: {amount, payeeVpa, payeeName, txnId(optional)}
  const {amount, payeeVpa, payeeName, txnId} = req.body;
  if(!amount || !payeeVpa) return res.status(400).json({error:'amount & payeeVpa required'});
  const params = new URLSearchParams({
    pa: payeeVpa,
    pn: payeeName||'RaiBee',
    am: String(amount),
    cu: 'INR',
    tn: 'Purchase from Rai Bee'
  });
  if(txnId) params.set('tr', txnId);
  const uri = 'upi://pay?' + params.toString();
  // Generate QR as dataURL
  try{
    const dataUrl = await QRCode.toDataURL(uri);
    res.json({upiDeepLink:uri, qrDataUrl:dataUrl});
  }catch(err){ console.error(err); res.status(500).json({error:'qr error'}); }
});

// Record a manual purchase (for demo/testing) - in production use webhooks from providers
app.post('/api/purchases/record', authRequired, (req,res)=>{
  const {videoId, provider, provider_payment_id} = req.body;
  db.prepare('INSERT INTO purchases (user_id, video_id, provider, provider_payment_id) VALUES (?,?,?,?)').run(req.user.id, videoId, provider||'manual', provider_payment_id||'');
  res.json({ok:true});
});

// Static serve for frontend production build (optional)
app.use('/', express.static(path.join(__dirname,'../frontend/build')));

app.listen(PORT, ()=> console.log('Server running on', PORT));
