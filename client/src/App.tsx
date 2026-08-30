import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { io } from 'socket.io-client';
import type { DrawSegment, GameSettings, RoomView } from '@garabato/shared';

const socket=io({autoConnect:true});
type Chat={id:string;name?:string;text:string;system?:boolean};
// sessionStorage mantiene la identidad al recargar, pero permite que dos pestañas
// del mismo navegador representen jugadores distintos. Guardamos también la
// identidad más reciente en localStorage como respaldo persistente.
const savedId=sessionStorage.getItem('garabato-player-id')||crypto.randomUUID();
sessionStorage.setItem('garabato-player-id',savedId);
localStorage.setItem('garabato-player-id',savedId);

function Canvas({canDraw}:{canDraw:boolean}){
  const ref=useRef<HTMLCanvasElement>(null),drawing=useRef(false),last=useRef<{x:number;y:number}|null>(null), history=useRef<DrawSegment[]>([]);
  const [color,setColor]=useState('#25242a'),[width,setWidth]=useState(6),[tool,setTool]=useState<'pen'|'eraser'>('pen');
  const paint=useCallback((s:DrawSegment)=>{const c=ref.current,ctx=c?.getContext('2d');if(!c||!ctx)return;ctx.beginPath();ctx.moveTo(s.from.x*c.width,s.from.y*c.height);ctx.lineTo(s.to.x*c.width,s.to.y*c.height);ctx.strokeStyle=s.tool==='eraser'?'#fffdf7':s.color;ctx.lineWidth=s.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();},[]);
  const clear=useCallback(()=>{const c=ref.current,ctx=c?.getContext('2d');if(c&&ctx){ctx.fillStyle='#fffdf7';ctx.fillRect(0,0,c.width,c.height);}},[]);
  const redraw=useCallback(()=>{clear();history.current.forEach(paint)},[clear,paint]);
  useEffect(()=>{const resize=()=>{const c=ref.current;if(!c)return;const box=c.getBoundingClientRect(),ratio=Math.min(devicePixelRatio,2);c.width=box.width*ratio;c.height=box.height*ratio;redraw()};resize();window.addEventListener('resize',resize);const segment=(s:DrawSegment)=>{history.current.push(s);paint(s)},reset=()=>{history.current=[];clear()},undo=()=>{history.current.pop();redraw()},sync=(items:DrawSegment[])=>{history.current=items;redraw()};socket.on('draw:segment',segment);socket.on('canvas:clear',reset);socket.on('canvas:undo',undo);socket.on('canvas:history',sync);socket.emit('canvas:sync');return()=>{window.removeEventListener('resize',resize);socket.off('draw:segment',segment);socket.off('canvas:clear',reset);socket.off('canvas:undo',undo);socket.off('canvas:history',sync)}},[clear,paint,redraw]);
  const pos=(e:ReactPointerEvent)=>{const b=ref.current!.getBoundingClientRect();return{x:(e.clientX-b.left)/b.width,y:(e.clientY-b.top)/b.height}};
  const down=(e:ReactPointerEvent)=>{if(!canDraw)return;drawing.current=true;last.current=pos(e);e.currentTarget.setPointerCapture(e.pointerId)};
  const move=(e:ReactPointerEvent)=>{if(!drawing.current||!last.current||!canDraw)return;const next=pos(e),s={id:crypto.randomUUID(),from:last.current,to:next,color,width,tool};history.current.push(s);paint(s);socket.emit('draw:segment',s);last.current=next};
  const up=()=>{drawing.current=false;last.current=null};
  return <div className="canvas-shell">
    <canvas ref={ref} aria-label="Lienzo de dibujo" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>
    {canDraw&&<div className="tools" aria-label="Herramientas de dibujo">
      <button className={tool==='pen'?'selected':''} onClick={()=>setTool('pen')} title="Lápiz">✎</button><button className={tool==='eraser'?'selected':''} onClick={()=>setTool('eraser')} title="Borrador">◇</button>
      <div className="colors">{['#25242a','#ef5b4c','#167d91','#efaa32','#6d4bb4','#3b8c57'].map(c=><button key={c} aria-label={`Color ${c}`} className={color===c?'selected':''} style={{background:c}} onClick={()=>{setColor(c);setTool('pen')}}/>)}</div>
      <label className="range"><span>Trazo</span><input aria-label="Grosor del trazo" type="range" min="2" max="24" value={width} onChange={e=>setWidth(+e.target.value)}/></label>
      <button onClick={()=>socket.emit('canvas:undo')} title="Deshacer">↶</button><button onClick={()=>socket.emit('canvas:clear')} title="Limpiar">Limpiar</button>
    </div>}
  </div>
}

function Home({error}:{error:string}){
  const [name,setName]=useState(localStorage.getItem('garabato-name')||''),[code,setCode]=useState(new URLSearchParams(location.search).get('sala')||'');
  const submit=(kind:'create'|'join')=>{const clean=name.trim();if(!clean)return;localStorage.setItem('garabato-name',clean);socket.emit(kind==='create'?'room:create':'room:join',{name:clean,code,playerId:savedId})};
  return <main className="home"><section className="hero"><div className="brand-mark">G!</div><p className="eyebrow">Dibuja · Adivina · Ríete</p><h1>Garabato<br/><i>Club</i></h1><p className="lead">Una mesa de dibujo virtual para esas noches con amigos en las que nadie sabe dibujar — y eso es lo mejor.</p></section>
    <section className="entry card"><div className="tape"/><h2>¿Cómo te llamamos?</h2><label>Tu nombre<input autoFocus maxLength={24} value={name} onChange={e=>setName(e.target.value)} placeholder="Ej. Dani" onKeyDown={e=>e.key==='Enter'&&submit('create')}/></label><button className="primary" onClick={()=>submit('create')}>Crear una sala <span>→</span></button><div className="or"><span>o entra con un código</span></div><div className="join-row"><label className="sr-only" htmlFor="code">Código de sala</label><input id="code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ABC12"/><button onClick={()=>submit('join')}>Unirme</button></div>{error&&<p className="error" role="alert">{error}</p>}<p className="fine">Sin cuentas. Sin descargas. Sólo comparte el código.</p></section></main>
}

function Lobby({room,me}:{room:RoomView;me:string}){
  const mine=room.players.find(p=>p.id===me),[words,setWords]=useState(''),[settings,setSettings]=useState(room.settings),[copied,setCopied]=useState(false);
  useEffect(()=>setSettings(room.settings),[room.settings]);
  const update=(patch:Partial<GameSettings>)=>{const next={...settings,...patch};setSettings(next);socket.emit('room:update',{settings:next,words})};
  const wordChange=(value:string)=>{setWords(value);socket.emit('room:update',{settings,words:value})};
  const link=`${location.origin}${location.pathname}?sala=${room.code}`;
  return <main className="room-page"><header className="topbar"><div className="mini-brand">G!</div><div><span>Sala privada</span><strong>{room.code}</strong></div><button className="copy" onClick={async()=>{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1500)}}>{copied?'¡Copiado!':'Copiar enlace'}</button></header>
    <div className="lobby-grid"><section className="card players-card"><p className="eyebrow">La pandilla</p><h2>{room.players.length} jugadores</h2><div className="player-list">{room.players.map((p,i)=><div className="player" key={p.id}><span className={`avatar a${i%5}`}>{p.name[0]?.toUpperCase()}</span><b>{p.name}{p.id===me?' (tú)':''}</b>{p.isHost&&<small>Anfitrión</small>}<i className={p.connected?'online':'offline'}/></div>)}</div><p className="code-note">Comparte <b>{room.code}</b> para invitar a alguien</p></section>
      <section className="card setup"><p className="eyebrow">Reglas de la mesa</p><h2>Prepara la partida</h2>{mine?.isHost?<>
        <div className="form-grid"><label>Rondas<input type="number" min="1" max="10" value={settings.rounds} onChange={e=>update({rounds:+e.target.value})}/></label><label>Segundos por turno<input type="number" min="30" max="180" step="10" value={settings.turnSeconds} onChange={e=>update({turnSeconds:+e.target.value})}/></label><label>Opciones de palabra<input type="number" min="2" max="5" value={settings.wordOptions} onChange={e=>update({wordOptions:+e.target.value})}/></label><label>Máximo de jugadores<input type="number" min="2" max="12" value={settings.maxPlayers} onChange={e=>update({maxPlayers:+e.target.value})}/></label></div>
        <fieldset><legend>Banco de palabras</legend><label className="radio"><input type="radio" checked={settings.wordMode==='mixed'} onChange={()=>update({wordMode:'mixed'})}/> Mezclar predeterminadas y mías</label><label className="radio"><input type="radio" checked={settings.wordMode==='custom'} onChange={()=>update({wordMode:'custom'})}/> Usar únicamente las mías</label><textarea value={words} onChange={e=>wordChange(e.target.value)} placeholder={'satélite, tostadora, dragón\no una palabra por línea'}/><span className="word-count">{room.customWordCount} palabras personalizadas válidas</span></fieldset>
        <label className="check"><input type="checkbox" checked={settings.allowRepeats} onChange={e=>update({allowRepeats:e.target.checked})}/> Permitir repetir palabras</label><button className="primary start" onClick={()=>socket.emit('game:start')}>Empezar partida <span>✦</span></button></>:<div className="waiting"><span className="scribble">⌁</span><h3>El anfitrión está preparando todo</h3><p>Mientras tanto, practica tu mejor dibujo de un ornitorrinco.</p></div>}</section></div></main>
}

function Game({room,me}:{room:RoomView;me:string}){
  const [options,setOptions]=useState<string[]>([]),[secret,setSecret]=useState(''),[chat,setChat]=useState<Chat[]>([]),[text,setText]=useState(''),[now,setNow]=useState(Date.now()),[lastWord,setLastWord]=useState('');
  const scroll=useRef<HTMLDivElement>(null),drawer=room.players.find(p=>p.id===room.drawerId),isDrawer=room.drawerId===me;
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);const opts=(x:string[])=>setOptions(x),sec=(x:string)=>{setSecret(x);setOptions([])},message=(x:{id:string;name:string;text:string})=>setChat(c=>[...c.slice(-60),x]),system=(x:string)=>setChat(c=>[...c.slice(-60),{id:crypto.randomUUID(),text:x,system:true}]),ended=(x:{word:string})=>{setLastWord(x.word);setSecret('');setOptions([])};socket.on('turn:options',opts);socket.on('turn:secret',sec);socket.on('chat:message',message);socket.on('chat:system',system);socket.on('turn:ended',ended);socket.emit('turn:sync');return()=>{clearInterval(timer);socket.off('turn:options',opts);socket.off('turn:secret',sec);socket.off('chat:message',message);socket.off('chat:system',system);socket.off('turn:ended',ended)}},[]);
  useEffect(()=>{if(isDrawer&&(room.phase==='choosing'||room.phase==='drawing'))socket.emit('turn:sync')},[isDrawer,room.phase,room.drawerId]);
  useEffect(()=>scroll.current?.scrollTo({top:scroll.current.scrollHeight}),[chat]);
  const remaining=Math.max(0,Math.ceil(((room.turnEndsAt||now)-now)/1000));const send=(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;socket.emit('chat:send',text);setText('')};
  if(room.phase==='finished'){const ranking=[...room.players].sort((a,b)=>b.score-a.score);return <main className="results"><div className="card"><p className="eyebrow">Fin de la partida</p><h1>El podio del garabato</h1><div className="podium">{ranking.map((p,i)=><div key={p.id} className={`rank r${i+1}`}><span>{i===0?'★':i+1}</span><b>{p.name}</b><strong>{p.score} pts</strong></div>)}</div><button className="primary" onClick={()=>location.reload()}>Jugar otra vez</button></div></main>}
  return <main className="game"><header className="gamebar"><div className="round"><span>Ronda</span><b>{room.round}/{room.totalRounds}</b></div><div className="turn-title"><span>{isDrawer?'Tu palabra':`${drawer?.name||'Alguien'} dibuja`}</span><strong>{isDrawer?(secret||'Elige una palabra'):(room.wordHint||'Preparando…')}</strong></div><div className={`timer ${remaining<11?'urgent':''}`}><span>Tiempo</span><b>{remaining}s</b></div></header>
    {room.phase==='choosing'&&isDrawer&&<div className="choice-overlay"><div className="card"><p className="eyebrow">Sólo tú puedes verlo</p><h2>¿Qué quieres dibujar?</h2><div className="choices">{options.map(x=><button key={x} onClick={()=>socket.emit('turn:choose',x)}>{x}</button>)}</div><small>Si no eliges, escogeremos una por ti.</small></div></div>}
    {room.phase==='turnEnd'&&<div className="reveal">La palabra era <b>{lastWord}</b></div>}
    <section className="board"><Canvas canDraw={isDrawer&&room.phase==='drawing'}/></section>
    <aside className="sidebar"><section className="score-panel"><h2>Marcador</h2>{[...room.players].sort((a,b)=>b.score-a.score).map((p,i)=><div className="score" key={p.id}><span>{i+1}</span><b>{p.name}</b>{p.guessed&&<i title="Ya acertó">✓</i>}<strong>{p.score}</strong></div>)}</section><section className="chat"><h2>Respuestas</h2><div className="messages" ref={scroll} aria-live="polite">{chat.length===0&&<p className="empty">Las respuestas aparecerán aquí.</p>}{chat.map(m=><p key={m.id} className={m.system?'system':''}>{!m.system&&<b>{m.name}: </b>}{m.text}</p>)}</div><form onSubmit={send}><input aria-label="Escribe tu respuesta" disabled={isDrawer||room.phase!=='drawing'} value={text} onChange={e=>setText(e.target.value)} placeholder={isDrawer?'Estás dibujando':'Escribe tu respuesta…'}/><button aria-label="Enviar respuesta" disabled={isDrawer}>↑</button></form></section></aside>
  </main>
}

export default function App(){const [room,setRoom]=useState<RoomView|null>(null),[error,setError]=useState('');useEffect(()=>{const joined=({code}:{code:string})=>history.replaceState({},'',`?sala=${code}`),state=(x:RoomView)=>{setRoom(x);setError('')},err=(x:string)=>setError(x),rejoin=()=>{const code=new URLSearchParams(location.search).get('sala'),name=localStorage.getItem('garabato-name');if(code&&name)socket.emit('room:join',{code,name,playerId:savedId})};socket.on('room:joined',joined);socket.on('room:state',state);socket.on('app:error',err);socket.on('connect',rejoin);if(socket.connected)rejoin();return()=>{socket.off('room:joined',joined);socket.off('room:state',state);socket.off('app:error',err);socket.off('connect',rejoin)}},[]);const me=room?.players.find(p=>p.id===savedId);return <><a className="skip" href="#main">Saltar al contenido</a><div id="main">{!room?<Home error={error}/>:room.phase==='lobby'?<Lobby room={room} me={savedId}/>:<Game room={room} me={savedId}/>}</div>{error&&room&&<div className="toast" role="alert">{error}<button onClick={()=>setError('')}>×</button></div>} {!me?.connected&&room&&<div className="connection">Reconectando…</div>}</>}
