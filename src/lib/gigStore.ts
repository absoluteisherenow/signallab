export const gigs = [{id:1,title:'Electric Nights Festival',date:'2026-04-15',time:'22:00',location:'Berlin, Germany',venue:'Tresor Club',status:'confirmed',audience:2500,fee:5000},{id:2,title:'Summer Series',date:'2026-04-22',time:'20:00',location:'Amsterdam, Netherlands',venue:'Melkweg',status:'confirmed',audience:1800,fee:3500},{id:3,title:'Techno Sessions',date:'2026-05-01',time:'23:00',location:'London, UK',venue:'Ministry of Sound',status:'pending',audience:3000,fee:6000},{id:4,title:'Open Air Summer',date:'2026-05-15',time:'19:00',location:'Basel, Switzerland',venue:'Kaserne',status:'confirmed',audience:4000,fee:7500}]

export function getGigById(id: number){return gigs.find(g=>g.id===id)}

export function gigToContext(gig: any){return gig.title+' at '+gig.venue+', '+gig.location}
