
// V17 Twitch + Trades client
let selectedOfferItem = null;
function itemSignature(item){ return `${item.id}|${item.rarity}`; }


function fillWantedSelect(){
  const sel=document.getElementById('wantedSelect'); if(!sel) return;
  sel.innerHTML=ITEMS.map(i=>`<option value="${i.id}">${i.name} - ${i.rarityLabel}</option>`).join('');
}
async function createTrade(){
  if(!selectedOfferItem){toast('Choisis un doublon à proposer.');return;}
  const wantedId=Number(document.getElementById('wantedSelect').value);
  const data=await api('/api/trades/create',{offerItem:selectedOfferItem,wantedId});
  if(!data||!data.ok){toast(data?.error||'Impossible de créer l’échange.');return;}
  currentUser=data.user; inventory=data.user.state.inventory||inventory; selectedOfferItem=null; document.getElementById('selectedOffer').textContent='Aucun doublon sélectionné';
  toast('Offre créée !'); renderInventory(); loadDuplicates(); loadTrades();
}
async function loadTrades(){
  const offers=document.getElementById('tradeOffers'), mine=document.getElementById('myTradeOffers'); if(!offers||!mine) return;
  const data=await api('/api/trades'); if(!data||!data.ok){offers.innerHTML='<p class="hint">Offres indisponibles.</p>';return;}
  const username=currentUser?.username||''; const all=data.trades||[];
  function row(t,own){ const wanted=ITEMS.find(i=>Number(i.id)===Number(t.wantedId)); return `<div class="trade-offer"><div><img src="${t.offerItem.image}"><b>${t.offerItem.name}</b><small>${t.offerItem.rarityLabel}</small></div><strong>contre</strong><div><img src="${wanted?.image||t.offerItem.image}"><b>${wanted?.name||'Carte demandée'}</b><small>${wanted?.rarityLabel||''}</small></div><div><small>👤 ${t.owner}</small>${own?`<button data-cancel-trade="${t.id}">Annuler</button>`:`<button data-accept-trade="${t.id}">Accepter</button>`}</div></div>`; }
  offers.innerHTML=all.filter(t=>t.owner.toLowerCase()!==username.toLowerCase()).map(t=>row(t,false)).join('')||'<p class="hint">Aucune offre disponible.</p>';
  mine.innerHTML=all.filter(t=>t.owner.toLowerCase()===username.toLowerCase()).map(t=>row(t,true)).join('')||'<p class="hint">Aucune offre créée.</p>';
}
async function acceptTrade(id){ const data=await api('/api/trades/accept',{tradeId:id}); if(!data||!data.ok){toast(data?.error||'Échange impossible.');return;} currentUser=data.user; inventory=data.user.state.inventory||inventory; toast('Échange accepté !'); renderInventory(); renderCollection(); loadDuplicates(); loadTrades(); }
async function cancelTrade(id){ const data=await api('/api/trades/cancel',{tradeId:id}); if(!data||!data.ok){toast(data?.error||'Annulation impossible.');return;} currentUser=data.user; inventory=data.user.state.inventory||inventory; toast('Offre annulée.'); renderInventory(); loadDuplicates(); loadTrades(); }


// V16 Real PvP client
let socket = null;
let searchStart = 0;
let searchInterval = null;

function ensureSocket(){
  if(socket) return socket;
  socket = io();

  socket.on("pvp_waiting", (data)=>{
    if(data.user && data.user.state){
      coins = data.user.state.coins;
      setCoins();
    }
    showSearching(true);
    toast("Recherche d’un adversaire...");
  });

  socket.on("pvp_found", ({ opponent })=>{
    showSearching(false);
    const vs = document.getElementById("vsOverlay");
    const txt = document.getElementById("vsText");
    const arena = document.querySelector(".battle-arena");
    if(txt) txt.textContent = `${currentUser?.username || "Toi"} VS ${opponent}`;
    if(vs) vs.classList.remove("hidden");
    if(arena) arena.classList.add("battle-found");
    const op = document.getElementById("opponentName");
    if(op) op.textContent = opponent;
    const result = document.getElementById("battleResult");
    if(result) result.textContent = "Adversaire trouvé ! Tirage 50/50...";
  });

  socket.on("pvp_result", (data)=>{
    const vs = document.getElementById("vsOverlay");
    if(vs) vs.classList.add("hidden");
    const arena = document.querySelector(".battle-arena");
    if(arena) arena.classList.remove("battle-found");

    currentUser = data.user;
    if(data.user?.state){
      coins = data.user.state.coins;
      setCoins();
    }
    const result = document.getElementById("battleResult");
    if(result) result.textContent = data.win ? `Victoire contre ${data.opponent} ! Tu gagnes 20 coins.` : `Défaite contre ${data.opponent}. Tu perds ta mise.`;
    toast(data.win ? "Victoire PvP : +10 coins net" : "Défaite PvP : -10 coins");
    renderBattleHistory();
    renderLeaderboard();
  });

  socket.on("pvp_cancelled", (data)=>{
    showSearching(false);
    if(data.user?.state){
      coins = data.user.state.coins;
      setCoins();
    }
    toast("Recherche annulée, mise remboursée.");
  });

  socket.on("pvp_error", ({ error })=>{
    showSearching(false);
    toast(error || "Erreur PvP");
  });

  return socket;
}

function showSearching(show){
  const box = document.getElementById("searchOverlay");
  const cancel = document.getElementById("cancelBattleBtn");
  const btn = document.getElementById("battleBtn");
  if(box) box.classList.toggle("hidden", !show);
  if(cancel) cancel.classList.toggle("hidden", !show);
  if(btn) btn.disabled = show;

  if(show){
    searchStart = Date.now();
    clearInterval(searchInterval);
    searchInterval = setInterval(()=>{
      const s = Math.floor((Date.now()-searchStart)/1000);
      const el = document.getElementById("searchTimer");
      if(el) el.textContent = `${s}s`;
    }, 300);
  } else {
    clearInterval(searchInterval);
  }
}

function startPvpSearch(){
  if(!currentUser || !currentUser.username){
    toast("Connecte-toi avant de lancer un 1v1.");
    return;
  }
  ensureSocket().emit("pvp_search", { username: currentUser.username });
}

function cancelPvpSearch(){
  if(!currentUser || !currentUser.username) return;
  ensureSocket().emit("pvp_cancel", { username: currentUser.username });
}


var currentUser = null;
var serverReady = false;

async function api(path, body){
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? {'Content-Type':'application/json'} : {},
    credentials:'include',
    body: body ? JSON.stringify(body) : undefined
  });
  return await res.json();
}

async function checkSession(){
  try{
    const data = await api('/api/me');
    if(data.ok && data.user){
      currentUser = data.user;
      serverReady = true;
      document.getElementById('loginScreen')?.classList.add('hidden');
      document.getElementById('accountName').textContent = currentUser.username;
      const bp=document.getElementById('battlePlayerName'); if(bp) bp.textContent=currentUser.username;

      if(currentUser.state){
        if(typeof currentUser.state.coins === 'number') coins = currentUser.state.coins;
        if(Array.isArray(currentUser.state.inventory)) inventory = currentUser.state.inventory;
        if(currentUser.state.stats) stats = currentUser.state.stats;
        if(typeof currentUser.state.freeCrates === 'number') freeCrates = currentUser.state.freeCrates;
        if(typeof currentUser.state.watchMinutes === 'number') watchMinutes = currentUser.state.watchMinutes;
      }

      setCoins();
      updateRewardsUI();
      renderDrops();
      renderInventory();
      renderMissions();
      renderLeaderboard();
      renderCollection();
      renderBattleHistory();
      
      
      fillWantedSelect();
      loadDuplicates();
      loadTrades();
      return true;
    }
  }catch(e){}
  document.getElementById('loginScreen')?.classList.remove('hidden');
  return false;
}

async function saveGameToServer(){
  if(!serverReady || !currentUser) return;
  try{
    await api('/api/save', {
      state:{
        coins,
        inventory,
        stats,
        freeCrates,
        watchMinutes
      }
    });
  }catch(e){}
}

async function doLogin(register=false){
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const msg = document.getElementById('loginMessage');
  if(!username || !password){
    msg.textContent = 'Entre un pseudo et un mot de passe.';
    return;
  }
  const data = await api(register ? '/api/register' : '/api/login', {username,password});
  if(!data.ok){
    msg.textContent = data.error || 'Erreur de connexion.';
    return;
  }
  msg.textContent = '';
  await /* checkSession fixed in login-fix.js */
  toast(register ? 'Compte créé !' : 'Connecté !');
}

async function logout(){
  await api('/api/logout', {});
  location.reload();
}

window.addEventListener('load', ()=>{
  fillWantedSelect();
  
  
  /* login fixed in login-fix.js */
  /* register fixed in login-fix.js */
  /* logout fixed in login-fix.js */
  /* checkSession fixed in login-fix.js */
});


function initTwitch(){
 const parent = location.hostname || 'localhost';
 const player = document.getElementById('twitchPlayer');
 const chat = document.getElementById('twitchChat');
 if(player){
   player.innerHTML = `<iframe src="https://player.twitch.tv/?channel=kazaelia&parent=${parent}" allowfullscreen></iframe>`;
 }
 if(chat){
   chat.innerHTML = `<iframe src="https://www.twitch.tv/embed/kazaelia/chat?parent=${parent}"></iframe>`;
 }
}


const ITEMS = [{"id": 1, "name": "Shiba Classic", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_01_uncommon.png"}, {"id": 2, "name": "Shiba Crème", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_02_uncommon.png"}, {"id": 3, "name": "Shiba Roux", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_03_uncommon.png"}, {"id": 4, "name": "Shiba Blanc", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_04_uncommon.png"}, {"id": 5, "name": "Shiba Noir", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_05_uncommon.png"}, {"id": 6, "name": "Shiba Sesame", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_06_uncommon.png"}, {"id": 7, "name": "Shiba Lunettes", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_07_uncommon.png"}, {"id": 8, "name": "Shiba Bandana", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_08_uncommon.png"}, {"id": 9, "name": "Shiba Couronne", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_09_uncommon.png"}, {"id": 10, "name": "Shiba Fleurs", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_10_uncommon.png"}, {"id": 11, "name": "Shiba Plage", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_11_uncommon.png"}, {"id": 12, "name": "Shiba Café", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_12_uncommon.png"}, {"id": 13, "name": "Shiba Pizza", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_13_uncommon.png"}, {"id": 14, "name": "Shiba Musique", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_14_uncommon.png"}, {"id": 15, "name": "Shiba Chibi", "rarity": "UNCOMMON", "rarityLabel": "PEU COMMUN", "image": "assets/keychains/keychain_15_uncommon.png"}, {"id": 16, "name": "Shiba Cowboy", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_16_common.png"}, {"id": 17, "name": "Shiba Pirate", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_17_common.png"}, {"id": 18, "name": "Shiba Ninja", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_18_common.png"}, {"id": 19, "name": "Shiba Samouraï", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_19_common.png"}, {"id": 20, "name": "Shiba Astronaute", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_20_common.png"}, {"id": 21, "name": "Shiba Pilote", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_21_common.png"}, {"id": 22, "name": "Shiba Docteur", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_22_common.png"}, {"id": 23, "name": "Shiba Policier", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_23_common.png"}, {"id": 24, "name": "Shiba Écolier", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_24_common.png"}, {"id": 25, "name": "Shiba Rocker", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_25_common.png"}, {"id": 26, "name": "Shiba Hipster", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_26_common.png"}, {"id": 27, "name": "Shiba Magicien", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_27_common.png"}, {"id": 28, "name": "Shiba Sportif", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_28_common.png"}, {"id": 29, "name": "Shiba Détective", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_29_common.png"}, {"id": 30, "name": "Shiba Skate", "rarity": "COMMON", "rarityLabel": "COMMUN", "image": "assets/keychains/keychain_30_common.png"}, {"id": 31, "name": "Shiba Dragon", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_31_rare.png"}, {"id": 32, "name": "Shiba Phoenix", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_32_rare.png"}, {"id": 33, "name": "Shiba Loup", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_33_rare.png"}, {"id": 34, "name": "Shiba Guerrier", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_34_rare.png"}, {"id": 35, "name": "Shiba Sorcier", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_35_rare.png"}, {"id": 36, "name": "Shiba Chevalier", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_36_rare.png"}, {"id": 37, "name": "Shiba Paladin", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_37_rare.png"}, {"id": 38, "name": "Shiba Viking", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_38_rare.png"}, {"id": 39, "name": "Shiba Gladiateur", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_39_rare.png"}, {"id": 40, "name": "Shiba Empereur", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_40_rare.png"}, {"id": 41, "name": "Shiba Royal", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_41_rare.png"}, {"id": 42, "name": "Shiba Divin", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_42_rare.png"}, {"id": 43, "name": "Shiba Lumière", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_43_rare.png"}, {"id": 44, "name": "Shiba Tempête", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_44_rare.png"}, {"id": 45, "name": "Shiba Ultime", "rarity": "RARE", "rarityLabel": "RARE", "image": "assets/keychains/keychain_45_rare.png"}, {"id": 46, "name": "Shiba Galaxy", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_46_epic.png"}, {"id": 47, "name": "Shiba Diamant", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_47_epic.png"}, {"id": 48, "name": "Shiba Or Massif", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_48_epic.png"}, {"id": 49, "name": "Shiba Cristal", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_49_epic.png"}, {"id": 50, "name": "Shiba Cyberpunk", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_50_epic.png"}, {"id": 51, "name": "Shiba Classic", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_51_epic.png"}, {"id": 52, "name": "Shiba Crème", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_52_epic.png"}, {"id": 53, "name": "Shiba Roux", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_53_epic.png"}, {"id": 54, "name": "Shiba Blanc", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_54_epic.png"}, {"id": 55, "name": "Shiba Noir", "rarity": "EPIC", "rarityLabel": "ÉPIQUE", "image": "assets/keychains/keychain_55_epic.png"}, {"id": 56, "name": "Shiba Sesame", "rarity": "LEGENDARY", "rarityLabel": "LÉGENDAIRE", "image": "assets/keychains/keychain_56_legendary.png"}, {"id": 57, "name": "Shiba Lunettes", "rarity": "LEGENDARY", "rarityLabel": "LÉGENDAIRE", "image": "assets/keychains/keychain_57_legendary.png"}, {"id": 58, "name": "Shiba Bandana", "rarity": "LEGENDARY", "rarityLabel": "LÉGENDAIRE", "image": "assets/keychains/keychain_58_legendary.png"}, {"id": 59, "name": "Shiba Couronne", "rarity": "LEGENDARY", "rarityLabel": "LÉGENDAIRE", "image": "assets/keychains/keychain_59_legendary.png"}, {"id": 60, "name": "Shiba Fleurs", "rarity": "LEGENDARY", "rarityLabel": "LÉGENDAIRE", "image": "assets/keychains/keychain_60_legendary.png"}];
const rates = [['LEGENDARY',0.05],['EPIC',0.2],['RARE',5],['COMMON',20],['UNCOMMON',74.75]];
var coins = Number(localStorage.getItem('coinsV19') || 0);
var inventory = JSON.parse(localStorage.getItem('inventoryV19') || '[]');
var stats = JSON.parse(localStorage.getItem('statsV19') || '{"opened":0,"m5":false,"m20":false,"rare":false,"shiny":false}');
let invFilter = 'ALL', boardMode='score';
var freeCrates = Number(localStorage.getItem('freeCratesV19') || 0);
var watchMinutes = Number(localStorage.getItem('watchMinutesV19') || 0);
let currentStreamId = localStorage.getItem('currentStreamV19') || 'kazaelia-default';
const byRarity = r => ITEMS.filter(i => i.rarity === r);
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2200)}
function scrollToId(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth'})}
function saveAll(){
 localStorage.setItem('coinsV19',coins);
 localStorage.setItem('inventoryV19',JSON.stringify(inventory));
 localStorage.setItem('statsV19',JSON.stringify(stats));
 saveGameToServer();
}
function setCoins(){document.getElementById('coins').textContent=coins.toFixed(0);saveAll()}
function getDrop(){
 const roll=Math.random()*100; let acc=0, rarity='UNCOMMON';
 for(const [r,chance] of rates){acc+=chance;if(roll<acc){rarity=r;break}}
 const item={...pick(byRarity(rarity))}; item.shiny=Math.random()<0.0001; item.time=Date.now(); return item;
}
function makeCard(item, cls='key-card', locked=false){
 return `<button class="${cls} ${item.rarity} ${item.shiny?'is-shiny':''} ${locked?'locked':''}" data-card="${item.id}" data-locked="${locked}"><img src="${item.image}" alt="${item.name}"><b>${locked?'???':item.name}</b><small>${locked?'À DÉBLOQUER':item.rarityLabel}</small>${item.shiny&&!locked?'<small class="shiny">★ SHINY</small>':''}</button>`;
}

function saveTwitchRewards(){
 localStorage.setItem('freeCratesV19', freeCrates);
 localStorage.setItem('watchMinutesV19', watchMinutes);
 localStorage.setItem('currentStreamV19', currentStreamId);
}
function updateRewardsUI(){
 const fc=document.getElementById('freeCrates');
 if(fc) fc.textContent=freeCrates;
 const bar=document.getElementById('watchProgress');
 const txt=document.getElementById('watchText');
 const pct=Math.min(100,(watchMinutes/60)*100);
 if(bar) bar.style.width=pct+'%';
 if(txt) txt.textContent=`${watchMinutes} / 60 min`;
 saveTwitchRewards();
 saveGameToServer();
}
function addFreeCrate(reason){
 freeCrates += 1;
 saveTwitchRewards();
 saveGameToServer();
 updateRewardsUI();
 toast(`+1 caisse gratuite : ${reason}`);
}
function addWatchMinutes(mins){
 watchMinutes += mins;
 while(watchMinutes >= 60){
   watchMinutes -= 60;
   freeCrates += 1;
   toast('+1 caisse gratuite : 60 min de visionnage');
 }
 updateRewardsUI();
}
function startWatchTimer(){
 // Démo navigateur : ajoute automatiquement 1 minute de progression toutes les 60 secondes si la page est ouverte.
 setInterval(()=>addWatchMinutes(1), 60000);
 updateRewardsUI();
}


function startBattle(){ startPvpSearch(); }
function renderBattleHistory(){
 const box = document.getElementById('battleHistory');
 if(!box) return;
 const hist = currentUser?.state?.battle?.history || [];
 if(!hist.length){
   box.innerHTML = '<p class="hint">Aucune battle pour le moment.</p>';
   return;
 }
 box.innerHTML = hist.slice(0,8).map(b=>`
   <div class="battle-row ${b.win?'win':'lose'}">
     <b>${b.win?'Victoire':'Défaite'} vs ${b.opponent || 'Adversaire'}</b>
     <span>${b.result || (b.win?'+50 coins':'-50 coins')}</span>
   </div>
 `).join('');
}

function renderStatic(){
 document.getElementById('ticker').innerHTML=ITEMS.slice(45,60).map(i=>makeCard(i,'mini')).join('');
 renderDrops(); renderInventory(); renderMissions(); renderLeaderboard(); renderCollection(); setCoins();
}

async function renderDrops(){
 const box = document.getElementById('lastDrops');
 const data = await api('/api/recent-drops');
 if(data && data.ok && data.drops && data.drops.length){
   box.innerHTML = data.drops.map(entry=>{
     const i = entry.drop;
     const date = new Date(entry.time);
     const time = date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
     return `<button class="key-card ${i.rarity} ${i.shiny?'is-shiny':''}" data-card="${i.id}">
       <img src="${i.image}" alt="${i.name}">
       <b>${i.name}</b>
       <small>${i.rarityLabel}</small>
       <small>👤 ${entry.username}</small>
       <small>🕒 ${time}</small>
     </button>`;
   }).join('');
   return;
 }
 const drops=inventory.slice(-12).reverse();
 box.innerHTML=(drops.length?drops:ITEMS.slice(0,12)).map(i=>makeCard(i)).join('');
}

function renderCollection(){
 const owned=new Set(inventory.map(i=>i.id));
 document.getElementById('collectionGrid').innerHTML=ITEMS.map(i=>makeCard(i,'key-card',!owned.has(i.id))).join('');
}
function renderMissions(){
 document.getElementById('m5').textContent=stats.m5?'Terminée ✅':`Progression: ${Math.min(stats.opened,5)}/5 · Récompense +30`;
 document.getElementById('m20').textContent=stats.m20?'Terminée ✅':`Progression: ${Math.min(stats.opened,20)}/20 · Récompense +100`;
 document.getElementById('mRare').textContent=stats.rare?'Terminée ✅':'Drop un Rare ou mieux · Récompense +50';
 document.getElementById('mShiny').textContent=stats.shiny?'Terminée ✅':'Drop un Shiny · Jackpot +500';
}
function scoreOf(i){return ({LEGENDARY:1000,EPIC:500,RARE:100,COMMON:50,UNCOMMON:20}[i.rarity]||0)+(i.shiny?2000:0)}

async function renderLeaderboard(){
 const mode = boardMode || 'score';
 const data = await api('/api/leaderboard?mode=' + encodeURIComponent(mode));
 if(!data || !data.ok){
   document.getElementById('leaderboardBox').innerHTML='<p class="hint">Classement indisponible.</p>';
   return;
 }
 const label = mode==='score' ? 'pts' : 'victoires';
 const rows = data.rows;
 document.getElementById('leaderboardBox').innerHTML = rows.length
   ? rows.map((r,i)=>`<button class="leader-row" data-action="profile"><b>#${i+1} ${r.username}</b><span>${r.value} ${label}</span></button>`).join('')
   : '<p class="hint">Aucun joueur classé pour le moment.</p>';
}

function spinAnimation(finalItem){
 const roulette=document.getElementById('roulette'), wrap=document.querySelector('.roulette-wrap'), rollItems=[];
 const finalIndex = 42;
 for(let i=0;i<finalIndex;i++)rollItems.push(pick(ITEMS));
 rollItems.push(finalItem);
 for(let i=0;i<14;i++)rollItems.push(pick(ITEMS));

 roulette.style.transition='none';
 roulette.style.transform='translateX(0)';
 roulette.innerHTML=rollItems.map(i=>makeCard(i,'key-card')).join('');

 requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const finalCard = roulette.children[finalIndex];
   const wrapCenter = wrap.clientWidth / 2;
   const cardCenter = finalCard.offsetLeft + finalCard.offsetWidth / 2;
   const randomMicroOffset = 0; // garde la récompense parfaitement sous la flèche
   const target = -(cardCenter - wrapCenter + randomMicroOffset);

   roulette.style.transition='transform 4.8s cubic-bezier(.08,.75,.13,1)';
   roulette.style.transform=`translateX(${target}px)`;
 }));
}
function applyMissions(drop){
 stats.opened++;
 if(!stats.m5&&stats.opened>=5){stats.m5=true;coins+=30;toast('Mission 5 box : +30 coins')}
 if(!stats.m20&&stats.opened>=20){stats.m20=true;coins+=100;toast('Mission 20 box : +100 coins')}
 if(!stats.rare&&['RARE','EPIC','LEGENDARY'].includes(drop.rarity)){stats.rare=true;coins+=50;toast('Mission rare : +50 coins')}
 if(!stats.shiny&&drop.shiny){stats.shiny=true;coins+=500;toast('SHINY : +500 coins')}
}
function openOne(showSpin=true){
 if(freeCrates>0){
  freeCrates -= 1;
  updateRewardsUI();
  toast('Caisse gratuite utilisée');
 } else {
  if(coins<10){toast('Pas assez de coins ou de caisse gratuite.');return}
  coins-=10; setCoins();
 }
 const drop=getDrop(); if(showSpin)spinAnimation(drop);
 setTimeout(()=>{inventory.push(drop);applyMissions(drop);saveAll();setCoins();
 document.getElementById('result').innerHTML=`<button class="win ${drop.rarity} ${drop.shiny?'is-shiny':''}" data-card="${drop.id}"><img src="${drop.image}"><div><h2>${drop.name}</h2><b>${drop.rarityLabel}</b>${drop.shiny?'<p class="shiny">★ SHINY</p>':''}</div></button>`;
 renderDrops();renderInventory();renderMissions();renderLeaderboard();renderCollection();
 }, showSpin?4900:150)
}

async function daily(){
 const data = await api('/api/daily', {});
 if(!data || !data.ok){
   if(data && data.remainingMs){
     const h = Math.ceil(data.remainingMs / 3600000);
     toast(`Daily déjà pris. Reviens dans environ ${h}h.`);
   } else {
     toast(data?.error || 'Daily indisponible.');
   }
   return;
 }
 coins = data.user.state.coins;
 if(typeof data.user.state.lastDailyAt === 'number'){
   currentUser = data.user;
 }
 setCoins();
 toast('+10 coins daily');
}

function showCard(id, locked=false){
 const item=ITEMS.find(i=>i.id==id); if(!item)return;
 document.getElementById('modalContent').innerHTML=locked?`<h2>Verrouillé</h2><img src="${item.image}"><p>Ouvre des box pour débloquer ce porte-clé.</p>`:`<h2>${item.name}</h2><img src="${item.image}"><h3>${item.rarityLabel}</h3><p>ID #${item.id}</p>`;
 document.getElementById('modal').classList.remove('hidden')
}
function closeModal(){document.getElementById('modal').classList.add('hidden')}
document.addEventListener('click',e=>{
 
  const selectDup=e.target.closest('[data-select-duplicate]');
  if(selectDup){ selectedOfferItem=window._duplicates?.[Number(selectDup.dataset.selectDuplicate)]; if(selectedOfferItem){document.getElementById('selectedOffer').textContent=`${selectedOfferItem.name} (${selectedOfferItem.rarityLabel})`; toast('Doublon sélectionné.');} return; }
  const accept=e.target.closest('[data-accept-trade]'); if(accept){acceptTrade(accept.dataset.acceptTrade);return;}
  const cancel=e.target.closest('[data-cancel-trade]'); if(cancel){cancelTrade(cancel.dataset.cancelTrade);return;}

 const sc=e.target.closest('[data-scroll]'); if(sc){scrollToId(sc.dataset.scroll);return}
 const card=e.target.closest('[data-card]'); if(card){showCard(card.dataset.card,card.dataset.locked==='true');return}
 const fil=e.target.closest('[data-inv-filter]'); if(fil){invFilter=fil.dataset.invFilter;renderInventory();toast('Filtre : '+invFilter);return}
 const board=e.target.closest('[data-board]'); if(board){boardMode=board.dataset.board;renderLeaderboard();return}
 const act=e.target.closest('[data-action]'); if(act){const a=act.dataset.action;
  if(a==='daily')daily();
  if(a==='simulateFollow')addFreeCrate('follow');
  if(a==='simulateSub')addFreeCrate('sub');
  if(a==='simulateResub')addFreeCrate('renouvellement de sub');
  if(a==='simulateGiftSub')addFreeCrate('sub offert');
  if(a==='simulateWatchMinute')addWatchMinutes(1);
  if(a==='simulate60min')addWatchMinutes(60); if(a==='open5'){for(let i=0;i<5;i++)openOne(i===0);toast('x5 lancé')} if(a==='resetDemo'){if(confirm('Reset ?')){localStorage.clear();location.reload()}}
  if(a==='shinyInfo')toast('Shiny = 0,01% bonus ultra rare'); if(a==='openTwitch')window.open('https://www.twitch.tv/kazaelia','_blank');
  if(a==='twitchBonus'){coins+=10;setCoins();toast('+10 coins Twitch')} if(a==='profile')toast('Profil Vincoune'); if(a==='support')toast('Support démo'); if(a==='credits')toast('ShibaBox by Vincoune'); if(a==='closeModal')closeModal();
 }
});
document.getElementById('openBtn').addEventListener('click',()=>openOne(true));
const battleBtn = document.getElementById('battleBtn');
if(battleBtn) battleBtn.addEventListener('click', startBattle);
const cancelBattleBtn = document.getElementById('cancelBattleBtn');
if(cancelBattleBtn) cancelBattleBtn.addEventListener('click', cancelPvpSearch);
const createTradeBtn=document.getElementById('createTradeBtn'); if(createTradeBtn) createTradeBtn.addEventListener('click', createTrade);
document.getElementById('dailyBtn').addEventListener('click',daily);
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});


renderStatic();
