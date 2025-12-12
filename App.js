import React, {useState, useEffect} from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = process.env.REACT_APP_API || 'http://localhost:4000';

function useAuth(){
  const [user, setUser] = useState(()=> JSON.parse(localStorage.getItem('rb_user')||'null'));
  const [token, setToken] = useState(()=> localStorage.getItem('rb_token')||'');
  const save = (u,t)=>{ setUser(u); setToken(t); localStorage.setItem('rb_user', JSON.stringify(u)); localStorage.setItem('rb_token', t); };
  const logout = ()=>{ setUser(null); setToken(''); localStorage.removeItem('rb_user'); localStorage.removeItem('rb_token'); };
  return {user, token, save, logout};
}

function App(){
  return (
    <BrowserRouter>
      <div className='container'>
        <Header />
        <Routes>
          <Route path='/' element={<Home/>} />
          <Route path='/login' element={<Login/>} />
          <Route path='/signup' element={<Signup/>} />
          <Route path='/admin' element={<Admin/>} />
          <Route path='/videos' element={<VideoList/>} />
          <Route path='/watch/:id' element={<Watch/>} />
          <Route path='*' element={<Home/>} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

function Header(){
  const auth = useAuth();
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <div>
        <h2 style={{margin:0}}>Rai Bee Exclusive</h2>
        <small style={{opacity:0.8}}>Confidence. Glamour. Bold.</small>
      </div>
      <nav>
        <Link to='/'>Home</Link> {' | '} <Link to='/videos'>Videos</Link> {' | '} <Link to='/admin'>Admin</Link> {' | '}
        {auth.user ? <button onClick={auth.logout} className='btn' style={{marginLeft:8}}>Logout</button> : <Link to='/login'>Login</Link>}
      </nav>
    </div>
  );
}

function Home(){ return (<div className='card'><h3>Welcome to Rai Bee Exclusive</h3><p>Explore videos, subscribe, or purchase pay-per-view content.</p></div>); }

function Login(){
  const navigate = useNavigate();
  const [email,setEmail] = useState('admin@raibee.test');
  const [pw,setPw] = useState('DemoPass123');
  const auth = useAuth();
  async function submit(e){
    e.preventDefault();
    try{
      const res = await axios.post(API+'/api/auth/login',{email,password:pw});
      auth.save(res.data.user, res.data.token);
      navigate('/');
    }catch(err){ alert(err.response?.data?.error || 'login failed'); }
  }
  return (<div className='card'><h3>Login</h3>
    <form onSubmit={submit}><input value={email} onChange={e=>setEmail(e.target.value)} placeholder='email'/> <br/><br/>
    <input type='password' value={pw} onChange={e=>setPw(e.target.value)} placeholder='password'/> <br/><br/>
    <button className='btn' type='submit'>Login</button></form>
  </div>);
}

function Signup(){
  const navigate = useNavigate();
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [pw,setPw]=useState('');
  async function submit(e){ e.preventDefault(); try{ await axios.post(API+'/api/auth/register',{name,email,password:pw}); alert('created'); navigate('/login'); }catch(err){ alert(err.response?.data?.error || 'error'); } }
  return (<div className='card'><h3>Sign up</h3>
    <form onSubmit={submit}><input value={name} onChange={e=>setName(e.target.value)} placeholder='name'/> <br/><br/>
    <input value={email} onChange={e=>setEmail(e.target.value)} placeholder='email'/> <br/><br/>
    <input type='password' value={pw} onChange={e=>setPw(e.target.value)} placeholder='password'/> <br/><br/>
    <button className='btn' type='submit'>Create</button></form>
  </div>);
}

function Admin(){
  const auth = useAuth();
  const [files,setFiles] = useState(null);
  const [title,setTitle] = useState('');
  const [visibility,setVisibility] = useState('subscribers');
  const [price,setPrice] = useState(49.99);

  async function upload(e){
    e.preventDefault();
    if(!auth.token) return alert('login as creator');
    const fd = new FormData();
    fd.append('file', files[0]);
    fd.append('title', title);
    fd.append('visibility', visibility);
    fd.append('price', price);
    try{
      await axios.post(API+'/api/videos/upload', fd, { headers: { Authorization: 'Bearer '+auth.token, 'Content-Type':'multipart/form-data' }});
      alert('uploaded');
    }catch(err){ alert(err.response?.data?.error || 'upload failed'); }
  }

  return (<div className='card'><h3>Admin / Creator Upload</h3>
    <form onSubmit={upload}><input type='file' onChange={e=>setFiles(e.target.files)} /> <br/><br/>
    <input placeholder='Title' value={title} onChange={e=>setTitle(e.target.value)} /> <br/><br/>
    <select value={visibility} onChange={e=>setVisibility(e.target.value)}>
      <option value='public'>Public</option><option value='subscribers'>Subscribers</option><option value='for-sale'>For sale</option>
    </select> <br/><br/>
    <input type='number' value={price} onChange={e=>setPrice(e.target.value)} /> <br/><br/>
    <button className='btn' type='submit'>Upload</button></form>
  </div>);
}

function VideoList(){
  const [videos,setVideos]=useState([]);
  useEffect(()=>{ axios.get(API+'/api/videos').then(r=>setVideos(r.data.videos)); },[]);
  return (<div className='card'><h3>Videos</h3>
    <div>{videos.map(v=>(
      <div key={v.id} style={{borderBottom:'1px solid #16202b',padding:'8px 0'}}><strong>{v.title}</strong> <br/> <small>Price: ₹{v.price}</small><br/>
      <Link to={'/watch/'+v.id} className='btn' style={{display:'inline-block',marginTop:8}}>Watch / Buy</Link></div>
    ))}</div>
  </div>);
}

function Watch(){
  // minimal: get playUrl by requesting /api/videos/watch/:id
  const {pathname} = window.location;
  const id = pathname.split('/').pop();
  const auth = useAuth();
  const [playUrl,setPlayUrl] = useState('');
  const [watermark,setWatermark] = useState('');
  useEffect(()=>{
    if(!auth.token){ alert('login to watch/buy'); return; }
    axios.get(API+'/api/videos/watch/'+id, { headers: { Authorization: 'Bearer '+auth.token } })
      .then(r=>{ setPlayUrl(API + r.data.playUrl); setWatermark(r.data.watermark); })
      .catch(err=>{ alert(err.response?.data?.error || 'no access'); })
  },[id, auth.token]);
  const [upi, setUpi] = useState(null);
  async function createUpi(){
    // create UPI deep link + QR for manual payment
    const amount = window.prompt('Amount (INR)');
    if(!amount) return;
    const res = await axios.post(API+'/api/pay/upi/create',{amount, payeeVpa: 'merchant@upi', payeeName: 'RaiBee'});
    setUpi(res.data);
  }
  async function recordPurchase(){
    await axios.post(API+'/api/purchases/record',{videoId:id, provider:'manual', provider_payment_id:'upi_manual'}, { headers:{ Authorization: 'Bearer '+auth.token }});
    alert('Recorded purchase (demo). Now re-open watch.');
  }
  return (<div className='card'>
    <h3>Watch</h3>
    {playUrl ? (<div>
      <video src={playUrl} controls style={{width:'100%'}}></video>
      <div style={{opacity:0.6,fontSize:12,marginTop:8}}>{watermark}</div>
    </div>) : (<div><p>To watch or buy, use one of the payment options below.</p>
      <button className='btn' onClick={createUpi}>Pay via UPI (QR + Deep link)</button> {' '}
      <button className='btn' onClick={recordPurchase}>Record manual purchase (demo)</button>
      {upi && <div style={{marginTop:12}}><img src={upi.qrDataUrl} alt='upi qr' style={{maxWidth:240}}/><br/>
        <a href={upi.upiDeepLink}>Open UPI app</a></div>}
    </div>)}
  </div>);
}

export default App;
