
// V15.1 LOGIN FIXED
(function(){
  const $ = (id) => document.getElementById(id);

  async function safeApi(path, body){
    const options = {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: body ? {"Content-Type":"application/json"} : {}
    };
    if(body) options.body = JSON.stringify(body);

    const res = await fetch(path, options);
    let data;
    try { data = await res.json(); }
    catch(e){ data = {ok:false, error:"Réponse serveur invalide"}; }
    if(!res.ok && data.ok !== false) data.ok = false;
    return data;
  }

  function setLoginMessage(msg, good=false){
    const el = $("loginMessage");
    if(!el) return;
    el.textContent = msg || "";
    el.style.color = good ? "#9cff9c" : "#ffb4b4";
  }

  function showLogin(show){
    const screen = $("loginScreen");
    if(!screen) return;
    screen.classList.toggle("hidden", !show);
  }

  function applyUser(user){
    if(!user) return;
    window.currentUser = user;

    const account = $("accountName");
    if(account) account.textContent = user.username || "Compte";

    const bp = $("battlePlayerName");
    if(bp) bp.textContent = user.username || "Toi";

    if(user.state){
      if(typeof user.state.coins === "number") window.coins = user.state.coins;
      if(Array.isArray(user.state.inventory)) window.inventory = user.state.inventory;
      if(user.state.stats) window.stats = user.state.stats;
      if(typeof user.state.freeCrates === "number") window.freeCrates = user.state.freeCrates;
      if(typeof user.state.watchMinutes === "number") window.watchMinutes = user.state.watchMinutes;
    }

    if(typeof setCoins === "function") setCoins();
    if(typeof updateRewardsUI === "function") updateRewardsUI();
    if(typeof renderDrops === "function") renderDrops();
    if(typeof renderInventory === "function") renderInventory();
    if(typeof renderMissions === "function") renderMissions();
    if(typeof renderLeaderboard === "function") renderLeaderboard();
    if(typeof renderCollection === "function") renderCollection();
    if(typeof renderBattleHistory === "function") renderBattleHistory();
  }

  async function check(){
    try{
      const data = await safeApi("/api/me");
      if(data.ok && data.user){
        window.serverReady = true;
        applyUser(data.user);
        showLogin(false);
        return true;
      }
    }catch(e){
      console.error("checkSession failed", e);
    }
    showLogin(true);
    return false;
  }

  async function login(register){
    const username = ($("loginUsername")?.value || "").trim();
    const password = $("loginPassword")?.value || "";

    if(username.length < 3){
      setLoginMessage("Pseudo trop court : minimum 3 caractères.");
      return;
    }
    if(password.length < 4){
      setLoginMessage("Mot de passe trop court : minimum 4 caractères.");
      return;
    }

    const btn = register ? $("registerBtn") : $("loginBtn");
    if(btn) btn.disabled = true;
    setLoginMessage(register ? "Création du compte..." : "Connexion...");

    try{
      const data = await safeApi(register ? "/api/register" : "/api/login", {username, password});
      if(!data.ok){
        setLoginMessage(data.error || "Erreur de connexion.");
        return;
      }
      applyUser(data.user);
      showLogin(false);
      setLoginMessage("");
      if(typeof toast === "function") toast(register ? "Compte créé !" : "Connecté !");
    }catch(e){
      console.error(e);
      setLoginMessage("Impossible de contacter le serveur. Vérifie Railway.");
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  async function logoutFixed(){
    try{ await safeApi("/api/logout", {}); }catch(e){}
    location.reload();
  }

  function bind(){
    $("loginBtn")?.addEventListener("click", (e)=>{ e.preventDefault(); login(false); });
    $("registerBtn")?.addEventListener("click", (e)=>{ e.preventDefault(); login(true); });
    $("logoutBtn")?.addEventListener("click", (e)=>{ e.preventDefault(); logoutFixed(); });

    ["loginUsername","loginPassword"].forEach(id=>{
      $(id)?.addEventListener("keydown", (e)=>{
        if(e.key === "Enter"){
          e.preventDefault();
          login(false);
        }
      });
    });

    check();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  // Replace older functions if they exist
  window.checkSession = check;
  window.doLogin = login;
  window.logout = logoutFixed;
})();
