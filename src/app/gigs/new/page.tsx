"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function NewGig() {
  const router = useRouter()
  const [form, setForm] = useState({title:"",venue:"",location:"",date:"",time:"",fee:"",audience:""})
  return (
    <div style={{fontFamily:"DM Mono, monospace",color:"#f0ebe2",background:"#070706",minHeight:"100vh",padding:"40px 48px"}}>
      <div style={{fontSize:"9px",letterSpacing:"0.3em",color:"#b08d57",textTransform:"uppercase",marginBottom:"24px"}}>Add new gig</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",maxWidth:"640px"}}>
        {[["title","Show title","Electric Nights Festival"],["venue","Venue","Tresor Club"],["location","Location","Berlin, Germany"],["date","Date","2026-06-01"],["time","Set time","23:00"],["fee","Fee (€)","5000"],["audience","Expected audience","2500"]].map(([k,l,p]) => (
          <div key={k}>
            <div style={{fontSize:"9px",letterSpacing:"0.18em",color:"#52504c",textTransform:"uppercase",marginBottom:"8px"}}>{l}</div>
            <input value={form[k as keyof typeof form]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={p}
              style={{width:"100%",background:"#0e0d0b",border:"1px solid #2e2c29",color:"#f0ebe2",fontFamily:"DM Mono,monospace",fontSize:"13px",padding:"12px 16px",outline:"none",boxSizing:"border-box"}} />
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:"12px",marginTop:"32px"}}>
        <button onClick={()=>router.push("/gigs")} style={{background:"#b08d57",color:"#070706",border:"none",fontFamily:"DM Mono,monospace",fontSize:"10px",letterSpacing:"0.18em",textTransform:"uppercase",padding:"14px 28px",cursor:"pointer"}}>Save gig</button>
        <button onClick={()=>router.push("/gigs")} style={{background:"transparent",color:"#52504c",border:"1px solid #2e2c29",fontFamily:"DM Mono,monospace",fontSize:"10px",letterSpacing:"0.18em",textTransform:"uppercase",padding:"14px 28px",cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  )
}