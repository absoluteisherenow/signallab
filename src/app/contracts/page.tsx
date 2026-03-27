'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Extracted {
  title:string;venue:string;location:string;date:string;time:string
  fee:string;currency:string;audience:string;status:string
  promoter_email:string;promoter_name:string;promoter_phone:string
  notes:string;load_in:string;soundcheck:string;doors:string
  set_length:string;parking:string;wifi:string;dressing_room:string
  hospitality:string;hotel_name:string;hotel_address:string
  backline:string;deposit_amount:string;deposit_due:string;balance_due:string
}
const EMPTY:Extracted={title:'',venue:'',location:'',date:'',time:'',fee:'',currency:'EUR',audience:'',status:'confirmed',promoter_email:'',promoter_name:'',promoter_phone:'',notes:'',load_in:'',soundcheck:'',doors:'',set_length:'',parking:'',wifi:'',dressing_room:'',hospitality:'',hotel_name:'',hotel_address:'',backline:'',deposit_amount:'',deposit_due:'',balance_due:''}
const iStyle={width:'100%',background:'var(--bg)',border:'1px solid var(--border-dim)',color:'var(--text)',fontFamily:'var(--font-mono)',fontSize:'13px',padding:'10px 14px',outline:'none',boxSizing:'border-box' as const}
const lStyle={fontSize:'10px',letterSpacing:'0.18em',color:'var(--text-dimmer)',textTransform:'uppercase' as const,marginBottom:'6px',display:'block'}

function F({label,value,onChange,ph=''}:{label:string;value:string;onChange:(v:string)=>void;ph?:string}) {
  return <div><label style={lStyle}>{label}</label><input value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={iStyle}/></div>
}
function Sec({label}:{label:string}) {
  return <div style={{fontSize:'10px',letterSpacing:'0.22em',color:'var(--gold)',textTransform:'uppercase',marginBottom:'20px',paddingBottom:'10px',borderBottom:'1px solid var(--border-dim)'}}>{label}</div>
}

export default function Contracts() {
  const router = useRouter()
  const [rawText,setRawText]=useState('')
  const [extracting,setExtracting]=useState(false)
  const [extracted,setExtracted]=useState<Extracted|null>(null)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [toast,setToast]=useState('')
  const fileRef=useRef<HTMLInputElement>(null)

  const showToast=(m:string)=>{setToast(m);setTimeout(()=>setToast(''),3500)}
  const update=(k:keyof Extracted,v:string)=>setExtracted(p=>p?{...p,[k]:v}:p)

  async function extract(text:string) {
    setExtracting(true);setError('')
    try {
      const res=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        system:'You are a booking contract parser. Return ONLY valid JSON, no markdown. Dates YYYY-MM-DD, times HH:MM 24h, fee numeric only.',
        max_tokens:1000,
        messages:[{role:'user',content:`Extract booking details from this text as JSON with keys: title,venue,location,date,time,fee,currency,audience,status,promoter_email,promoter_name,promoter_phone,notes,load_in,soundcheck,doors,set_length,parking,wifi,dressing_room,hospitality,hotel_name,hotel_address,backline,deposit_amount,deposit_due,balance_due\n\nTEXT:\n${text}`}]
      })})
      const data=await res.json()
      const raw=data.content?.[0]?.text||''
      setExtracted({...EMPTY,...JSON.parse(raw.replace(/```json|```/g,'').trim())})
      showToast('Contract parsed — review below')
    } catch(e:any){setError('Parse failed: '+e.message)}
    finally{setExtracting(false)}
  }

  async function save() {
    if(!extracted||!extracted.title){setError('Title required');return}
    setSaving(true);setError('')
    try {
      const r=await fetch('/api/gigs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        title:extracted.title,venue:extracted.venue,location:extracted.location,date:extracted.date,time:extracted.time,
        fee:extracted.fee?parseFloat(extracted.fee):0,currency:extracted.currency||'EUR',
        audience:extracted.audience?parseInt(extracted.audience):0,status:extracted.status||'confirmed',
        promoter_email:extracted.promoter_email,
        notes:[extracted.notes,extracted.promoter_name&&`Promoter: ${extracted.promoter_name}`,extracted.promoter_phone&&`Phone: ${extracted.promoter_phone}`,extracted.deposit_amount&&`Deposit: ${extracted.deposit_amount} ${extracted.currency} due ${extracted.deposit_due}`,extracted.balance_due&&`Balance due: ${extracted.balance_due}`].filter(Boolean).join('\n')
      })})
      const d=await r.json()
      if(!d.success)throw new Error(d.error||'Save failed')
      showToast(`${extracted.title} added`)
      setTimeout(()=>router.push('/logistics'),1200)
    } catch(e:any){setError(e.message);setSaving(false)}
  }

  return (
    <div style={{background:'var(--bg)',color:'var(--text)',fontFamily:'var(--font-mono)',minHeight:'100vh',padding:'40px 48px'}}>
      <div style={{marginBottom:'40px'}}>
        <div style={{fontSize:'10px',letterSpacing:'0.3em',color:'var(--gold)',textTransform:'uppercase',display:'flex',alignItems:'center',gap:'12px',marginBottom:'12px'}}>
          <span style={{display:'block',width:'28px',height:'1px',background:'var(--gold)'}}/>Tour Lab — Contracts
        </div>
        <div className="display" style={{fontSize:'28px'}}>Contract parser</div>
        <div style={{fontSize:'13px',color:'var(--text-dimmer)',marginTop:'8px'}}>Paste a booking email or contract — extracts venue, times, hotel, backline, fee, deposits</div>
      </div>

      {/* EMAIL WORKFLOW BANNER */}
      <div style={{background:'rgba(176, 141, 87, 0.06)',border:'1px solid rgba(176, 141, 87, 0.25)',padding:'20px 24px',marginBottom:'32px',borderRadius:'4px'}}>
        <div style={{fontSize:'10px',letterSpacing:'0.15em',color:'var(--gold)',textTransform:'uppercase',marginBottom:'8px'}}>💌 Faster way</div>
        <div style={{fontSize:'12px',color:'var(--text)',lineHeight:'1.6'}}>
          Forward booking emails to <strong>advancingabsolute@gmail.com</strong> — they'll be automatically parsed and create gigs in Tour Lab. No copy/paste needed.
        </div>
      </div>

      {!extracted ? (
        <div style={{maxWidth:'800px'}}>
          <div className="card" style={{marginBottom:'16px'}}>
            <div style={{fontSize:'10px',letterSpacing:'0.2em',color:'var(--text-dimmer)',textTransform:'uppercase',marginBottom:'14px'}}>Paste contract, booking email, or rider</div>
            <textarea value={rawText} onChange={e=>setRawText(e.target.value)} rows={14}
              placeholder={'Paste booking confirmation here...\n\nExample:\nDear Artist, We confirm your booking at Tresor Club, Berlin.\nDate: 15 April 2026, Set time: 23:00-01:00\nFee: EUR 5000 (50% deposit due 1 April)\nLoad-in: 20:00, Soundcheck: 21:30\nHotel: Hotel Adlon, Unter den Linden 77\nBackline: Pioneer CDJ-3000 x2, DJM-V10'}
              style={{...iStyle,resize:'vertical',lineHeight:'1.7',fontSize:'12px'}}/>
            <div style={{marginTop:'20px',display:'flex',alignItems:'center',gap:'16px'}}>
              <button onClick={()=>extract(rawText)} disabled={extracting||!rawText.trim()} style={{background:extracting||!rawText.trim()?'var(--panel)':'var(--gold)',color:extracting||!rawText.trim()?'var(--text-dimmer)':'var(--bg)',border:`1px solid ${extracting||!rawText.trim()?'var(--border-dim)':'var(--gold)'}`,fontFamily:'var(--font-mono)',fontSize:'10px',letterSpacing:'0.2em',textTransform:'uppercase',padding:'14px 32px',cursor:'pointer',display:'flex',alignItems:'center',gap:'10px'}}>
                {extracting&&<div style={{width:'10px',height:'10px',border:'1px solid currentColor',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>}
                {extracting?'Extracting...':'Extract details →'}
              </button>
              {extracting&&<div style={{fontSize:'11px',color:'var(--text-dimmer)'}}>Claude is reading the contract...</div>}
            </div>
            <div style={{marginTop:'16px'}}>
              <input ref={fileRef} type="file" accept=".pdf,.txt,.doc,.docx" style={{display:'none'}} onChange={e=>{if(e.target.files?.[0])e.target.files[0].text().then(extract).catch(()=>{setError('Could not read file — paste text instead')})}}/>
              <button onClick={()=>fileRef.current?.click()} className="btn-secondary" style={{fontSize:'10px',padding:'10px 20px'}}>or upload file</button>
            </div>
          </div>
          {error&&<div style={{fontSize:'12px',color:'#8a4a3a',padding:'12px 16px',border:'1px solid rgba(138, 74, 58, 0.3)',background:'rgba(138, 74, 58, 0.1)'}}>{error}</div>}
          <div className="card" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px 24px'}}>
            {['Show title & venue','Date, set time & length','Fee + deposit dates','Promoter name/email/phone','Load-in & soundcheck','Doors open time','Hotel name & address','Backline / tech rider','Parking & WiFi','Dressing room & rider','Contract date','Additional notes'].map(i=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'11px',color:'var(--text-dimmer)',padding:'5px 0'}}>
                <span style={{color:'var(--green)'}}>✓</span>{i}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{maxWidth:'900px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'28px'}}>
            <div style={{fontSize:'12px',color:'var(--green)'}}>Parsed — review and confirm</div>
            <button onClick={()=>{setExtracted(null);setRawText('')}} className="btn-secondary" style={{fontSize:'10px',padding:'8px 18px'}}>← Parse another</button>
          </div>
          {[
            {title:'Show details',fields:[
              {label:'Show title *',key:'title',ph:'Electric Nights Festival'},{label:'Venue',key:'venue',ph:'Tresor Club'},
              {label:'Location',key:'location',ph:'Berlin, Germany'},{label:'Set time',key:'time',ph:'23:00'},
            ]},
          ].map(sec=>(
            <div key={sec.title} className="card">
              <Sec label={sec.title}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                {sec.fields.map(f=><F key={f.key} label={f.label} value={(extracted as any)[f.key]} onChange={v=>update(f.key as keyof Extracted,v)} ph={f.ph}/>)}
                <div><label style={lStyle}>Date</label><input type="date" value={extracted.date} onChange={e=>update('date',e.target.value)} style={iStyle}/></div>
                <div><label style={lStyle}>Status</label><select value={extracted.status} onChange={e=>update('status',e.target.value)} style={iStyle}><option value="confirmed">Confirmed</option><option value="pending">Pending</option></select></div>
              </div>
            </div>
          ))}
          <div className="card">
            <Sec label="Financial"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 80px 1fr 1fr 1fr',gap:'16px'}}>
              <F label="Fee" value={extracted.fee} onChange={v=>update('fee',v)} ph="5000"/>
              <div><label style={lStyle}>Currency</label><select value={extracted.currency} onChange={e=>update('currency',e.target.value)} style={iStyle}>{['EUR','GBP','USD','AUD'].map(c=><option key={c}>{c}</option>)}</select></div>
              <F label="Deposit amount" value={extracted.deposit_amount} onChange={v=>update('deposit_amount',v)} ph="2500"/>
              <div><label style={lStyle}>Deposit due</label><input type="date" value={extracted.deposit_due} onChange={e=>update('deposit_due',e.target.value)} style={iStyle}/></div>
              <div><label style={lStyle}>Balance due</label><input type="date" value={extracted.balance_due} onChange={e=>update('balance_due',e.target.value)} style={iStyle}/></div>
            </div>
          </div>
          <div className="card">
            <Sec label="Promoter"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'16px'}}>
              <F label="Name" value={extracted.promoter_name} onChange={v=>update('promoter_name',v)} ph="Jane Smith"/>
              <F label="Email" value={extracted.promoter_email} onChange={v=>update('promoter_email',v)} ph="bookings@venue.com"/>
              <F label="Phone" value={extracted.promoter_phone} onChange={v=>update('promoter_phone',v)} ph="+49 30 123456"/>
            </div>
          </div>
          <div className="card">
            <Sec label="Show logistics"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'16px',marginBottom:'16px'}}>
              <F label="Load-in" value={extracted.load_in} onChange={v=>update('load_in',v)} ph="20:00"/>
              <F label="Soundcheck" value={extracted.soundcheck} onChange={v=>update('soundcheck',v)} ph="21:30"/>
              <F label="Doors" value={extracted.doors} onChange={v=>update('doors',v)} ph="22:00"/>
              <F label="Set length (mins)" value={extracted.set_length} onChange={v=>update('set_length',v)} ph="90"/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
              <F label="Parking" value={extracted.parking} onChange={v=>update('parking',v)} ph="2 spaces at stage door"/>
              <F label="WiFi" value={extracted.wifi} onChange={v=>update('wifi',v)} ph="GreenRoom / pw123"/>
            </div>
          </div>
          <div className="card">
            <Sec label="Hotel & hospitality"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
              <F label="Hotel name" value={extracted.hotel_name} onChange={v=>update('hotel_name',v)} ph="Hotel Adlon"/>
              <F label="Hotel address" value={extracted.hotel_address} onChange={v=>update('hotel_address',v)} ph="Unter den Linden 77"/>
            </div>
            <div><label style={lStyle}>Hospitality rider</label><textarea value={extracted.hospitality} onChange={e=>update('hospitality',e.target.value)} rows={2} style={{...iStyle,resize:'vertical'}}/></div>
          </div>
          <div className="card" style={{marginBottom:'24px'}}>
            <Sec label="Backline & notes"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
              <div><label style={lStyle}>Backline / tech rider</label><textarea value={extracted.backline} onChange={e=>update('backline',e.target.value)} rows={3} style={{...iStyle,resize:'vertical'}} placeholder="Pioneer CDJ-3000 x2, DJM-V10..."/></div>
              <div><label style={lStyle}>Notes</label><textarea value={extracted.notes} onChange={e=>update('notes',e.target.value)} rows={3} style={{...iStyle,resize:'vertical'}}/></div>
            </div>
          </div>
          {error&&<div style={{fontSize:'12px',color:'#8a4a3a',padding:'14px 18px',border:'1px solid rgba(138, 74, 58, 0.3)',background:'rgba(138, 74, 58, 0.1)',marginBottom:'20px'}}>{error}</div>}
          <div style={{display:'flex',gap:'12px'}}>
            <button onClick={save} disabled={saving} className="btn-primary" style={{fontSize:'11px',padding:'16px 36px',opacity:saving?0.6:1,cursor:saving?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:'10px'}}>
              {saving&&<div style={{width:'10px',height:'10px',border:'1px solid currentColor',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>}
              {saving?'Saving...':'Save gig + logistics →'}
            </button>
            <button onClick={()=>router.push('/logistics')} className="btn-secondary" style={{fontSize:'11px',padding:'16px 28px'}}>Cancel</button>
          </div>
        </div>
      )}
      {toast&&<div className="toast"><div className="toast-label">Contracts</div>{toast}</div>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
