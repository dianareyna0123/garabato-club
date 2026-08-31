import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { DrawSegment, FillAction, GameSettings, ShapeAction } from '@garabato/shared';
import { DEFAULT_WORDS, buildTurnOrder, isNearAnswer, newRoom, normalizeAnswer, parseWords, roomView, scoreGuess, undoLastStroke, type Player, type Room } from './game.js';

const app = express();
const server = createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN;
if (allowedOrigin) app.use(cors({ origin: allowedOrigin }));
app.use(express.json());
const io = new Server(server, { ...(allowedOrigin ? { cors: { origin: allowedOrigin } } : {}), maxHttpBufferSize: 100_000 });
const rooms = new Map<string, Room>();
const socketRooms = new Map<string, { code:string; playerId:string }>();
const buckets = new Map<string, { draw:number[]; chat:number[] }>();

const cleanText = (v: unknown, max=120) => typeof v === 'string' ? v.replace(/[<>]/g,'').trim().slice(0,max) : '';
const codeOf = (v: unknown) => cleanText(v,6).toUpperCase().replace(/[^A-Z0-9]/g,'');
const makeCode = () => { let c=''; do c=Math.random().toString(36).slice(2,7).toUpperCase(); while(rooms.has(c)); return c; };
const current = (socket: Socket) => { const ref=socketRooms.get(socket.id); return ref ? { room:rooms.get(ref.code), playerId:ref.playerId } : undefined; };
const emitRoom = (r:Room) => io.to(r.code).emit('room:state', roomView(r));
const allowed = (socketId:string, kind:'draw'|'chat', max:number, windowMs:number) => {
  const now=Date.now(), b=buckets.get(socketId) || {draw:[],chat:[]}; b[kind]=b[kind].filter(t=>now-t<windowMs); buckets.set(socketId,b);
  if(b[kind].length>=max) return false; b[kind].push(now); return true;
};
const opacityOf = (value:unknown) => Math.max(.1,Math.min(1,Number(value)||1));

function join(socket:Socket, room:Room, playerId:string, name:string) {
  let p=room.players.get(playerId);
  if(p) { p.socketId=socket.id; p.connected=true; p.lastSeen=Date.now(); if(room.phase==='lobby') p.name=name||p.name; }
  else {
    if(room.players.size>=room.settings.maxPlayers || room.phase!=='lobby') return socket.emit('app:error','La sala no admite más jugadores.');
    p={id:playerId,name,score:0,isHost:room.players.size===0,connected:true,guessed:false,lastSeen:Date.now()}; room.players.set(playerId,p);
  }
  socket.join(room.code); socketRooms.set(socket.id,{code:room.code,playerId}); socket.emit('room:joined',{code:room.code,playerId}); emitRoom(room);
}

function finishTurn(room:Room) {
  if(room.phase!=='drawing' && room.phase!=='choosing') return;
  clearTimeout(room.turnTimer); clearTimeout(room.chooseTimer); room.hintTimers.forEach(clearTimeout);room.hintTimers=[];room.phase='turnEnd';
  io.to(room.code).emit('turn:ended',{word:room.secretWord || room.options?.[0] || '', guesses:room.guessOrder, nextAt:Date.now()+5000});
  emitRoom(room); setTimeout(()=>startNextTurn(room),5000);
}

function wordPool(room:Room) {
  const source=room.settings.wordMode==='custom' ? room.customWords : [...DEFAULT_WORDS,...room.customWords];
  return source.filter(w=>room.settings.allowRepeats || !room.usedWords.has(normalizeAnswer(w)));
}

function startNextTurn(room:Room) {
  if(room.phase==='finished' || !rooms.has(room.code)) return;
  room.turnIndex++;
  while(room.turnIndex<room.turnOrder.length && !room.players.get(room.turnOrder[room.turnIndex])?.connected) room.turnIndex++;
  if(room.turnIndex>=room.turnOrder.length) { room.phase='finished'; room.drawerId=undefined; room.secretWord=undefined; emitRoom(room); io.to(room.code).emit('game:finished'); return; }
  room.drawerId=room.turnOrder[room.turnIndex]; room.round=Math.floor(room.turnIndex / Math.max(1,room.turnOrder.length/room.settings.rounds))+1;
  room.players.forEach(p=>p.guessed=false); room.secretWord=undefined; room.guessOrder=[]; room.history=[]; room.phase='choosing';room.turnEndsAt=undefined;room.chooseEndsAt=Date.now()+15000;
  const pool=wordPool(room); room.options=[...pool].sort(()=>Math.random()-.5).slice(0,room.settings.wordOptions);
  const drawer=room.players.get(room.drawerId); if(drawer?.socketId) io.to(drawer.socketId).emit('turn:options',room.options);
  emitRoom(room); room.chooseTimer=setTimeout(()=>chooseWord(room,room.options?.[0]),15000);
}

function chooseWord(room:Room, choice?:string) {
  if(room.phase!=='choosing' || !choice || !room.options?.includes(choice)) return;
  clearTimeout(room.chooseTimer); room.chooseEndsAt=undefined;room.secretWord=choice; room.usedWords.add(normalizeAnswer(choice)); room.phase='drawing'; room.turnEndsAt=Date.now()+room.settings.turnSeconds*1000;
  const drawer=room.players.get(room.drawerId!); if(drawer?.socketId) io.to(drawer.socketId).emit('turn:secret',choice);
  io.to(room.code).emit('canvas:clear'); emitRoom(room);const totalMs=room.settings.turnSeconds*1000;room.hintTimers=[setTimeout(()=>emitRoom(room),totalMs/3),setTimeout(()=>emitRoom(room),totalMs*2/3)];room.turnTimer=setTimeout(()=>finishTurn(room),totalMs);
}

io.on('connection', socket => {
  socket.on('room:create',(data:{name?:unknown;playerId?:unknown})=>{ const name=cleanText(data?.name,24), id=cleanText(data?.playerId,60); if(!name||!id) return socket.emit('app:error','Escribe un nombre válido.'); const r=newRoom(makeCode()); rooms.set(r.code,r); join(socket,r,id,name); });
  socket.on('room:join',(data:{code?:unknown;name?:unknown;playerId?:unknown})=>{ const r=rooms.get(codeOf(data?.code)), name=cleanText(data?.name,24), id=cleanText(data?.playerId,60); if(!r) return socket.emit('app:error','No encontramos esa sala.'); if(!name||!id) return socket.emit('app:error','Datos de jugador no válidos.'); join(socket,r,id,name); });
  socket.on('room:sync',()=>{ const c=current(socket); if(!c?.room)return;socket.emit('room:state',roomView(c.room));if(c.room.drawerId===c.playerId){if(c.room.phase==='choosing'&&c.room.options)socket.emit('turn:options',c.room.options);if(c.room.phase==='drawing'&&c.room.secretWord)socket.emit('turn:secret',c.room.secretWord);} });
  socket.on('room:update',(data:{settings?:Partial<GameSettings>;words?:unknown})=>{ const c=current(socket); if(!c?.room || !c.room.players.get(c.playerId)?.isHost || c.room.phase!=='lobby') return; const s=data?.settings||{}; c.room.settings={ rounds:Math.max(1,Math.min(10,Number(s.rounds)||3)), turnSeconds:Math.max(30,Math.min(180,Number(s.turnSeconds)||80)), wordOptions:Math.max(2,Math.min(5,Number(s.wordOptions)||3)), allowRepeats:Boolean(s.allowRepeats), maxPlayers:Math.max(2,Math.min(12,Number(s.maxPlayers)||8)), wordMode:s.wordMode==='custom'?'custom':'mixed' }; c.room.customWords=parseWords(cleanText(data?.words,10000)); emitRoom(c.room); });
  socket.on('game:start',()=>{ const c=current(socket); if(!c?.room || !c.room.players.get(c.playerId)?.isHost || c.room.phase!=='lobby') return; const connected=[...c.room.players.values()].filter(p=>p.connected); const needed=c.room.settings.allowRepeats?c.room.settings.wordOptions:connected.length*c.room.settings.rounds+c.room.settings.wordOptions-1; if(connected.length<2) return socket.emit('app:error','Se necesitan al menos 2 jugadores.'); if(wordPool(c.room).length<needed) return socket.emit('app:error',`Se necesitan al menos ${needed} palabras disponibles con esta configuración.`); c.room.players.forEach(p=>p.score=0); c.room.turnOrder=buildTurnOrder(connected.map(p=>p.id),c.room.settings.rounds); c.room.turnIndex=-1; c.room.usedWords.clear(); startNextTurn(c.room); });
  socket.on('turn:sync',()=>{ const c=current(socket); if(!c?.room || c.room.drawerId!==c.playerId) return; if(c.room.phase==='choosing'&&c.room.options) socket.emit('turn:options',c.room.options); if(c.room.phase==='drawing'&&c.room.secretWord) socket.emit('turn:secret',c.room.secretWord); });
  socket.on('turn:choose',(word:unknown)=>{ const c=current(socket); if(!c?.room || c.room.drawerId!==c.playerId) return; chooseWord(c.room,cleanText(word,40)); });
  socket.on('draw:segment',(seg:DrawSegment)=>{ const c=current(socket); if(!c?.room || c.room.phase!=='drawing' || c.room.drawerId!==c.playerId || !allowed(socket.id,'draw',180,1000)) return; if(!seg || !['pen','eraser'].includes(seg.tool) || !/^#[0-9a-f]{6}$/i.test(seg.color) || !Number.isFinite(seg.from?.x)||!Number.isFinite(seg.from?.y)||!Number.isFinite(seg.to?.x)||!Number.isFinite(seg.to?.y)) return; const safe:DrawSegment={id:cleanText(seg.id,60)||crypto.randomUUID(),tool:seg.tool,color:seg.color,width:Math.max(1,Math.min(40,Number(seg.width))),opacity:seg.tool==='eraser'?1:opacityOf(seg.opacity),from:{x:Math.max(0,Math.min(1,seg.from.x)),y:Math.max(0,Math.min(1,seg.from.y))},to:{x:Math.max(0,Math.min(1,seg.to.x)),y:Math.max(0,Math.min(1,seg.to.y))}}; c.room.history.push(safe); if(c.room.history.length>5000)c.room.history.shift(); socket.to(c.room.code).emit('draw:segment',safe); });
  socket.on('draw:fill',(fill:FillAction)=>{const c=current(socket);if(!c?.room||c.room.phase!=='drawing'||c.room.drawerId!==c.playerId||!allowed(socket.id,'draw',10,1000))return;if(!fill||fill.tool!=='fill'||!/^#[0-9a-f]{6}$/i.test(fill.color)||!Number.isFinite(fill.x)||!Number.isFinite(fill.y))return;const safe:FillAction={id:cleanText(fill.id,60)||crypto.randomUUID(),tool:'fill',color:fill.color,opacity:opacityOf(fill.opacity),x:Math.max(0,Math.min(1,fill.x)),y:Math.max(0,Math.min(1,fill.y))};c.room.history.push(safe);if(c.room.history.length>5000)c.room.history.shift();socket.to(c.room.code).emit('draw:fill',safe);});
  socket.on('draw:shape',(shape:ShapeAction)=>{const c=current(socket);if(!c?.room||c.room.phase!=='drawing'||c.room.drawerId!==c.playerId||!allowed(socket.id,'draw',30,1000))return;if(!shape||shape.tool!=='shape'||!['circle','square','triangle','star'].includes(shape.shape)||!/^#[0-9a-f]{6}$/i.test(shape.color)||!Number.isFinite(shape.from?.x)||!Number.isFinite(shape.from?.y)||!Number.isFinite(shape.to?.x)||!Number.isFinite(shape.to?.y))return;const safe:ShapeAction={id:cleanText(shape.id,60)||crypto.randomUUID(),tool:'shape',shape:shape.shape,color:shape.color,width:Math.max(1,Math.min(40,Number(shape.width))),opacity:opacityOf(shape.opacity),from:{x:Math.max(0,Math.min(1,shape.from.x)),y:Math.max(0,Math.min(1,shape.from.y))},to:{x:Math.max(0,Math.min(1,shape.to.x)),y:Math.max(0,Math.min(1,shape.to.y))}};c.room.history.push(safe);if(c.room.history.length>5000)c.room.history.shift();socket.to(c.room.code).emit('draw:shape',safe);});
  socket.on('canvas:clear',()=>{ const c=current(socket); if(c?.room?.phase==='drawing'&&c.room.drawerId===c.playerId){c.room.history=[];io.to(c.room.code).emit('canvas:clear');} });
  socket.on('canvas:undo',()=>{ const c=current(socket); if(c?.room?.phase!=='drawing'||c.room.drawerId!==c.playerId)return;const undone=undoLastStroke(c.room.history);if(!undone.strokeId)return;c.room.history=undone.segments;io.to(c.room.code).emit('canvas:undo',undone.strokeId); });
  socket.on('canvas:sync',()=>{ const c=current(socket); if(c?.room) socket.emit('canvas:history',c.room.history); });
  socket.on('chat:send',(raw:unknown)=>{ const c=current(socket), msg=cleanText(raw,180); if(!c?.room||c.room.phase!=='drawing'||!msg||!allowed(socket.id,'chat',5,5000)) return; const room=c.room,p=room.players.get(c.playerId); if(!p||p.id===room.drawerId) return; if(!p.guessed&&room.secretWord&&normalizeAnswer(msg)===normalizeAnswer(room.secretWord)){p.guessed=true;const position=room.guessOrder.length+1,pts=scoreGuess(position,(room.turnEndsAt||0)-Date.now(),room.settings.turnSeconds*1000);p.score+=pts;room.guessOrder.push({playerId:p.id,name:p.name,position,points:pts});const drawer=room.players.get(room.drawerId!);if(drawer)drawer.score+=50;io.to(room.code).emit('chat:system',`${p.name} acertó #${position} · +${pts}`);emitRoom(room);const guessers=[...room.players.values()].filter(x=>x.connected&&x.id!==room.drawerId);if(guessers.every(x=>x.guessed))finishTurn(room);return;} if(!p.guessed&&room.secretWord&&isNearAnswer(msg,room.secretWord))socket.emit('chat:near');io.to(room.code).emit('chat:message',{id:crypto.randomUUID(),playerId:p.id,name:p.name,text:msg,at:Date.now()}); });
  socket.on('disconnect',()=>{ const ref=socketRooms.get(socket.id);socketRooms.delete(socket.id);buckets.delete(socket.id);if(!ref)return;const r=rooms.get(ref.code),p=r?.players.get(ref.playerId);if(!r||!p)return;p.connected=false;p.socketId=undefined;if(p.isHost){p.isHost=false;const next=[...r.players.values()].find(x=>x.connected);if(next)next.isHost=true;}if(r.drawerId===p.id&&(r.phase==='drawing'||r.phase==='choosing'))finishTurn(r);emitRoom(r);setTimeout(()=>{if(![...r.players.values()].some(x=>x.connected)){clearTimeout(r.turnTimer);clearTimeout(r.chooseTimer);r.hintTimers.forEach(clearTimeout);rooms.delete(r.code);}},60000); });
});

app.get('/api/health',(_req,res)=>res.json({ok:true,rooms:rooms.size}));
const here=path.dirname(fileURLToPath(import.meta.url)); const clientDist=path.resolve(here,'../../client/dist');
app.use(express.static(clientDist,{setHeaders:(res,file)=>{if(file.endsWith('index.html'))res.setHeader('Cache-Control','no-store');}})); app.get('*',(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(clientDist,'index.html')));
const port=Number(process.env.PORT)||3001; server.listen(port,()=>console.log(`Servidor listo en puerto ${port}`));
