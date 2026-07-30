
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import cookieSession from "cookie-session";
import http from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "db.json");

app.use(express.json({limit:"5mb"}));
app.use(cookieSession({
  name:"shibabox_session",
  keys:[process.env.SESSION_SECRET || "change_me_secret"],
  maxAge:30*24*60*60*1000
}));

function readDb(){
  if(!fs.existsSync(DB_PATH)) return {users:{}, globalDrops:[]};
  const db = JSON.parse(fs.readFileSync(DB_PATH,"utf8"));
  db.users = db.users || {};
  db.globalDrops = db.globalDrops || [];
  return db;
}
function writeDb(db){
  fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2));
}
function hashPassword(password, salt){
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}
function defaultState(){
  return {
    coins:0,
    inventory:[],
    stats:{opened:0,m5:false,m20:false,rare:false,shiny:false},
    freeCrates:0,
    watchMinutes:0,
    lastDailyAt:0,
    battle:{daily:0,weekly:0,monthly:0,total:0,history:[]}
  };
}
function normalizeUser(user){
  user.state = user.state || defaultState();
  user.state.coins = typeof user.state.coins === "number" ? user.state.coins : 0;
  user.state.inventory = Array.isArray(user.state.inventory) ? user.state.inventory : [];
  user.state.stats = user.state.stats || {opened:0,m5:false,m20:false,rare:false,shiny:false};
  user.state.freeCrates = typeof user.state.freeCrates === "number" ? user.state.freeCrates : 0;
  user.state.watchMinutes = typeof user.state.watchMinutes === "number" ? user.state.watchMinutes : 0;
  user.state.lastDailyAt = typeof user.state.lastDailyAt === "number" ? user.state.lastDailyAt : 0;
  user.state.battle = user.state.battle || {daily:0,weekly:0,monthly:0,total:0,history:[]};
  user.state.battle.history = Array.isArray(user.state.battle.history) ? user.state.battle.history : [];
  return user;
}
function safeUser(user){
  normalizeUser(user);
  return {
    username:user.username,
    state:user.state,
    createdAt:user.createdAt
  };
}
function scoreOfState(state){
  const points = {LEGENDARY:1000, EPIC:500, RARE:100, COMMON:50, UNCOMMON:20};
  return (state.inventory || []).reduce((s,i)=>s+(points[i.rarity]||0)+(i.shiny?2000:0),0);
}
function getLoggedUser(req, db){
  if(!req.session.username) return null;
  const user = db.users[req.session.username];
  if(!user) return null;
  return normalizeUser(user);
}

app.post("/api/register", (req,res)=>{
  const username = String(req.body.username || "").trim().slice(0,24);
  const password = String(req.body.password || "");
  if(username.length < 3) return res.json({ok:false,error:"Pseudo trop court."});
  if(password.length < 4) return res.json({ok:false,error:"Mot de passe trop court."});

  const key = username.toLowerCase();
  const db = readDb();
  if(db.users[key]) return res.json({ok:false,error:"Ce pseudo existe déjà."});

  const salt = crypto.randomBytes(16).toString("hex");
  db.users[key] = {
    username,
    salt,
    passwordHash:hashPassword(password,salt),
    createdAt:new Date().toISOString(),
    state:defaultState()
  };
  writeDb(db);
  req.session.username = key;
  res.json({ok:true,user:safeUser(db.users[key])});
});

app.post("/api/login", (req,res)=>{
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const db = readDb();
  const user = db.users[username];
  if(!user) return res.json({ok:false,error:"Compte introuvable."});
  if(hashPassword(password,user.salt) !== user.passwordHash) return res.json({ok:false,error:"Mot de passe incorrect."});
  req.session.username = username;
  res.json({ok:true,user:safeUser(user)});
});

app.post("/api/logout", (req,res)=>{
  req.session = null;
  res.json({ok:true});
});

app.get("/api/me", (req,res)=>{
  const db = readDb();
  const user = getLoggedUser(req, db);
  if(!user) return res.json({ok:false});
  writeDb(db);
  res.json({ok:true,user:safeUser(user)});
});

app.post("/api/save", (req,res)=>{
  const db = readDb();
  const user = getLoggedUser(req, db);
  if(!user) return res.status(401).json({ok:false,error:"Non connecté."});

  const incoming = req.body.state || {};
  normalizeUser(user);

  // Save game fields, but keep server-controlled daily/battle if absent.
  user.state.coins = typeof incoming.coins === "number" ? incoming.coins : user.state.coins;
  const oldInvLen = Array.isArray(user.state.inventory) ? user.state.inventory.length : 0;
  const newInventory = Array.isArray(incoming.inventory) ? incoming.inventory : user.state.inventory;
  if(Array.isArray(newInventory) && newInventory.length > oldInvLen){
    const added = newInventory.slice(oldInvLen);
    for(const drop of added){
      db.globalDrops.unshift({
        username:user.username,
        drop,
        time:Date.now()
      });
    }
    db.globalDrops = db.globalDrops.slice(0,50);
  }
  user.state.inventory = newInventory;
  user.state.stats = incoming.stats || user.state.stats;
  user.state.freeCrates = user.state.freeCrates;
  user.state.watchMinutes = user.state.watchMinutes;
  user.updatedAt = new Date().toISOString();

  writeDb(db);
  res.json({ok:true,user:safeUser(user)});
});

app.post("/api/daily", (req,res)=>{
  const db = readDb();
  const user = getLoggedUser(req, db);
  if(!user) return res.status(401).json({ok:false,error:"Non connecté."});
  normalizeUser(user);

  const now = Date.now();
  const last = user.state.lastDailyAt || 0;
  const wait = 24*60*60*1000;
  if(now - last < wait){
    return res.json({ok:false,error:"Daily déjà pris.", remainingMs: wait - (now-last), user:safeUser(user)});
  }

  user.state.lastDailyAt = now;
  user.state.coins += 10;
  writeDb(db);
  res.json({ok:true, reward:10, user:safeUser(user)});
});

app.post("/api/battle", (req,res)=>{
  const db = readDb();
  const user = getLoggedUser(req, db);
  if(!user) return res.status(401).json({ok:false,error:"Non connecté."});
  normalizeUser(user);

  if(user.state.coins < 10){
    return res.json({ok:false,error:"Pas assez de coins.", user:safeUser(user)});
  }

  user.state.coins -= 10;
  const win = Math.random() < 0.5;
  if(win){
    user.state.coins += 20;
    user.state.battle.daily += 1;
    user.state.battle.weekly += 1;
    user.state.battle.monthly += 1;
    user.state.battle.total += 1;
  }

  const opponent = "Adversaire";
  user.state.battle.history.unshift({
    win, opponent, date:Date.now(), result: win ? "+10 coins net" : "-10 coins"
  });
  user.state.battle.history = user.state.battle.history.slice(0,30);

  writeDb(db);
  res.json({ok:true, win, opponent, user:safeUser(user)});
});

app.get("/api/leaderboard", (req,res)=>{
  const mode = String(req.query.mode || "score");
  const db = readDb();
  const rows = Object.values(db.users).map(u=>{
    normalizeUser(u);
    const state = u.state;
    let value = scoreOfState(state);
    if(mode === "daily") value = state.battle?.daily || 0;
    if(mode === "weekly") value = state.battle?.weekly || 0;
    if(mode === "monthly") value = state.battle?.monthly || 0;
    return { username:u.username, value };
  }).sort((a,b)=>b.value-a.value).slice(0,20);

  res.json({ok:true, mode, rows});
});


app.get("/api/recent-drops", (req,res)=>{
  const db = readDb();
  res.json({ok:true, drops:(db.globalDrops || []).slice(0,30)});
});

app.get("/api/health", (req,res)=>res.json({ok:true}));


// V16 Real PvP matchmaking
const waitingPlayers = new Map(); // username -> { socketId, username }

function getUserByUsername(username){
  const db = readDb();
  const user = db.users[String(username || "").toLowerCase()];
  return { db, user: user ? normalizeUser(user) : null };
}

function runPvpMatch(playerA, playerB){
  const { db, user: userA } = getUserByUsername(playerA.username);
  const userB = db.users[String(playerB.username).toLowerCase()];
  if(!userA || !userB) return;

  normalizeUser(userB);

  const winA = Math.random() < 0.5;
  const winner = winA ? userA : userB;
  const loser = winA ? userB : userA;

  winner.state.coins += 20;
  winner.state.battle.daily += 1;
  winner.state.battle.weekly += 1;
  winner.state.battle.monthly += 1;
  winner.state.battle.total += 1;

  const now = Date.now();
  userA.state.battle.history.unshift({
    win: winA,
    opponent: userB.username,
    date: now,
    result: winA ? "+10 coins net" : "-10 coins"
  });
  userB.state.battle.history.unshift({
    win: !winA,
    opponent: userA.username,
    date: now,
    result: !winA ? "+10 coins net" : "-10 coins"
  });
  userA.state.battle.history = userA.state.battle.history.slice(0,30);
  userB.state.battle.history = userB.state.battle.history.slice(0,30);

  writeDb(db);

  io.to(playerA.socketId).emit("pvp_result", {
    opponent:userB.username,
    win:winA,
    user:safeUser(userA)
  });
  io.to(playerB.socketId).emit("pvp_result", {
    opponent:userA.username,
    win:!winA,
    user:safeUser(userB)
  });
}

io.on("connection", (socket)=>{
  socket.on("pvp_search", ({ username })=>{
    username = String(username || "").trim();
    if(!username) return socket.emit("pvp_error", { error:"Non connecté." });

    const { db, user } = getUserByUsername(username);
    if(!user) return socket.emit("pvp_error", { error:"Compte introuvable." });
    if(user.state.coins < 10) return socket.emit("pvp_error", { error:"Pas assez de coins." });

    // Deduct stake immediately
    user.state.coins -= 10;
    writeDb(db);

    const player = { socketId:socket.id, username };
    socket.data.username = username;

    // Find first available different player
    let opponent = null;
    for(const [key, p] of waitingPlayers.entries()){
      if(key.toLowerCase() !== username.toLowerCase()){
        opponent = p;
        waitingPlayers.delete(key);
        break;
      }
    }

    if(opponent){
      socket.emit("pvp_found", { opponent:opponent.username });
      io.to(opponent.socketId).emit("pvp_found", { opponent:username });
      setTimeout(()=>runPvpMatch(player, opponent), 2200);
    } else {
      waitingPlayers.set(username.toLowerCase(), player);
      socket.emit("pvp_waiting", { user:safeUser(user) });
    }
  });

  socket.on("pvp_cancel", ({ username })=>{
    username = String(username || socket.data.username || "").trim();
    if(!username) return;
    const key = username.toLowerCase();
    if(waitingPlayers.has(key)){
      waitingPlayers.delete(key);
      const { db, user } = getUserByUsername(username);
      if(user){
        user.state.coins += 10; // refund
        writeDb(db);
        socket.emit("pvp_cancelled", { user:safeUser(user) });
      }
    }
  });

  socket.on("disconnect", ()=>{
    const username = socket.data.username;
    if(username && waitingPlayers.has(username.toLowerCase())){
      waitingPlayers.delete(username.toLowerCase());
      const { db, user } = getUserByUsername(username);
      if(user){
        user.state.coins += 10; // refund on disconnect
        writeDb(db);
      }
    }
  });
});


// ---------- Trades ----------
function itemKey(item){ return String(item?.id||"")+"|"+String(item?.rarity||""); }
function duplicateItems(inventory){ const counts={}; for(const item of inventory||[]) counts[itemKey(item)]=(counts[itemKey(item)]||0)+1; return (inventory||[]).filter((item,idx,arr)=>counts[itemKey(item)]>1 && arr.findIndex(x=>itemKey(x)===itemKey(item))!==idx); }
function removeOneItem(inv,item){ const key=itemKey(item); const idx=inv.findIndex(x=>itemKey(x)===key); if(idx>=0) return inv.splice(idx,1)[0]; return null; }
app.get("/api/trades",(req,res)=>{const db=readDb(); db.trades=db.trades||[]; res.json({ok:true,trades:db.trades.filter(t=>t.status==="open").slice(0,50)});});
app.get("/api/my-duplicates",(req,res)=>{const db=readDb(); const user=getLoggedUser(req,db); if(!user) return res.status(401).json({ok:false}); normalizeUser(user); res.json({ok:true,duplicates:duplicateItems(user.state.inventory)});});
app.post("/api/trades/create",(req,res)=>{
  const db=readDb(); const user=getLoggedUser(req,db); if(!user) return res.status(401).json({ok:false,error:"Non connecté."}); normalizeUser(user); db.trades=db.trades||[];
  const offerItem=req.body.offerItem; const wantedId=Number(req.body.wantedId); const dups=duplicateItems(user.state.inventory);
  if(!dups.some(i=>itemKey(i)===itemKey(offerItem))) return res.json({ok:false,error:"Tu ne peux échanger que tes doublons."});
  const removed=removeOneItem(user.state.inventory,offerItem); if(!removed) return res.json({ok:false,error:"Item introuvable."});
  const trade={id:crypto.randomBytes(8).toString("hex"),owner:user.username,offerItem:removed,wantedId,status:"open",createdAt:Date.now()};
  db.trades.unshift(trade); db.trades=db.trades.slice(0,100); writeDb(db); res.json({ok:true,trade,user:safeUser(user)});
});
app.post("/api/trades/accept",(req,res)=>{
  const db=readDb(); const user=getLoggedUser(req,db); if(!user) return res.status(401).json({ok:false,error:"Non connecté."}); normalizeUser(user); db.trades=db.trades||[];
  const trade=db.trades.find(t=>t.id===req.body.tradeId && t.status==="open"); if(!trade) return res.json({ok:false,error:"Offre introuvable."});
  if(trade.owner.toLowerCase()===user.username.toLowerCase()) return res.json({ok:false,error:"Tu ne peux pas accepter ta propre offre."});
  const wantedIdx=user.state.inventory.findIndex(i=>Number(i.id)===Number(trade.wantedId)); if(wantedIdx<0) return res.json({ok:false,error:"Tu n’as pas la carte demandée."});
  const owner=db.users[trade.owner.toLowerCase()]; if(!owner) return res.json({ok:false,error:"Propriétaire introuvable."}); normalizeUser(owner);
  const wantedItem=user.state.inventory.splice(wantedIdx,1)[0]; user.state.inventory.push(trade.offerItem); owner.state.inventory.push(wantedItem); trade.status="done"; trade.acceptedBy=user.username; trade.completedAt=Date.now(); writeDb(db); res.json({ok:true,user:safeUser(user)});
});
app.post("/api/trades/cancel",(req,res)=>{
  const db=readDb(); const user=getLoggedUser(req,db); if(!user) return res.status(401).json({ok:false,error:"Non connecté."}); normalizeUser(user); db.trades=db.trades||[];
  const trade=db.trades.find(t=>t.id===req.body.tradeId && t.status==="open"); if(!trade) return res.json({ok:false,error:"Offre introuvable."});
  if(trade.owner.toLowerCase()!==user.username.toLowerCase()) return res.json({ok:false,error:"Pas ton offre."});
  user.state.inventory.push(trade.offerItem); trade.status="cancelled"; writeDb(db); res.json({ok:true,user:safeUser(user)});
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, ()=>{
  console.log(`ShibaBox V19.1 Crash Fixed running on port ${PORT}`);
});
