// Beastbound: Verdant Shards — Mobile Prototype
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const panel = document.getElementById('panel');
  const msgEl = document.getElementById('message');
  const choicesEl = document.getElementById('choices');

  // --- Helpers ---
  const rand = (n) => Math.floor(Math.random() * n);
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

  // Prevent page scroll on touch drag over canvas
  ['touchstart','touchmove','touchend','gesturestart'].forEach(evt => {
    canvas.addEventListener(evt, e => { e.preventDefault(); }, {passive:false});
    panel.addEventListener(evt, e => { e.preventDefault(); }, {passive:false});
  });

  function showPanel(text, options=[]) {
    panel.classList.remove('hidden');
    msgEl.textContent = text;
    choicesEl.innerHTML = '';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.textContent = opt.label;
      btn.onclick = opt.onClick;
      choicesEl.appendChild(btn);
    });
  }
  function hidePanel(){ panel.classList.add('hidden'); }

  // --- Data ---
  const MOVES = {
    GlowPeck: { name:'Glow Peck', power: 16, kind:'attack', acc:0.95 },
    MoonMend: { name:'Moon Mend', power: 14, kind:'heal', acc:1.00 },
    TideSnap: { name:'Tide Snap', power: 18, kind:'attack', acc:0.9 },
    EmberCoil: { name:'Ember Coil', power: 20, kind:'attack', acc:0.88 },
    LeafFlick: { name:'Leaf Flick', power: 12, kind:'attack', acc:0.98 },
    PebbleToss: { name:'Pebble Toss', power: 10, kind:'attack', acc:0.98 },
    YipStrike: { name:'Yip Strike', power: 15, kind:'attack', acc:0.95 },
  };

  const BESTIARY = {
    glimfer:  { name:'Glimfer',  baseHP: 60, moves:['GlowPeck','MoonMend'], color:'#8ef0c3' },
    torraclaw:{ name:'Torraclaw',baseHP: 68, moves:['TideSnap','PebbleToss'], color:'#7ec9f7' },
    fyreel:   { name:'Fyreel',   baseHP: 62, moves:['EmberCoil','PebbleToss'], color:'#f79e7e' },
    sprigbit: { name:'Sprigbit', baseHP: 44, moves:['LeafFlick'], color:'#9af78e' },
    emberpup: { name:'Emberpup', baseHP: 46, moves:['YipStrike'], color:'#f7c18e' },
    pebblit:  { name:'Pebblit',  baseHP: 52, moves:['PebbleToss'], color:'#c0c7d1' },
  };

  const STARTERS = ['glimfer','torraclaw','fyreel'];
  const WILD_POOL = ['sprigbit','emberpup','pebblit'];

  let game = {
    state: 'starter',
    player: { x: 5, y: 6, party: [] },
    wild: null,
    battle: null,
  };

  // Save/Load
  function saveGame(){
    localStorage.setItem('bb_save_mobile', JSON.stringify(game));
  }
  function loadGame(){
    const raw = localStorage.getItem('bb_save_mobile');
    if(raw){ try { game = JSON.parse(raw); } catch(e){} }
  }
  loadGame();

  // Tilemap
  const mapW = 20, mapH = 15, tile = 32;
  const map = [];
  for(let y=0;y<mapH;y++){
    const row = [];
    for(let x=0;x<mapW;x++){
      let v = 0;
      if((x>2 && x<17) && (y>3 && y<12)) v = 1;
      if((x<3 || x>16) || (y<2 || y>12)) v = 0;
      if((x===10 && y>1 && y<6)) v = 2;
      if(x===2 && y===2) v = 3;
      row.push(v);
    }
    map.push(row);
  }

  // Responsive canvas (keeps 4:3 aspect)
  function resizeCanvas(){
    // Canvas intrinsic size stays 640x480; CSS scales it. Nothing to do here.
    // We still can redraw to ensure crispness after orientation change.
    drawMapOrBattle();
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);

  // Draw map
  function drawMap(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<mapH;y++){
      for(let x=0;x<mapW;x++){
        const v = map[y][x];
        if(v===0){ ctx.fillStyle = '#2a2f3a'; }
        else if(v===1){ ctx.fillStyle = '#1d3b2b'; }
        else if(v===2){ ctx.fillStyle = '#12304f'; }
        else if(v===3){ ctx.fillStyle = '#3a2f2a'; }
        ctx.fillRect(x*tile, y*tile, tile, tile);
        if(v===1){
          ctx.fillStyle = '#2e8b57';
          for(let i=0;i<3;i++){
            ctx.fillRect(x*tile+Math.floor(Math.random()*tile), y*tile+Math.floor(Math.random()*tile), 2, 2);
          }
        }
      }
    }
    // player
    ctx.fillStyle = '#e7f2ec';
    ctx.fillRect(game.player.x*tile+8, game.player.y*tile+6, 16, 20);
  }

  function drawMapOrBattle(){
    if(game.state==='battle') drawBattle();
    else drawMap();
  }

  // Creature instance
  function makeBeast(id){
    const tpl = BESTIARY[id];
    return { id, name: tpl.name, color: tpl.color, maxHP: tpl.baseHP, hp: tpl.baseHP, moves: tpl.moves.slice(), level: 5 + Math.floor(Math.random()*3) };
  }
  function randomWild(){
    const id = WILD_POOL[Math.floor(Math.random()*WILD_POOL.length)];
    const b = makeBeast(id);
    b.level = 3 + Math.floor(Math.random()*5);
    b.maxHP += Math.floor(Math.random()*10);
    b.hp = b.maxHP;
    return b;
  }

  // Battle system
  function startBattle(wild=false){
    const playerActive = game.player.party[0];
    if(!playerActive){ return; }
    const foe = wild ? randomWild() : makeBeast('sprigbit');
    game.wild = wild ? foe : null;
    game.battle = { player: JSON.parse(JSON.stringify(playerActive)), foe, turn: 'player', log: [] };
    game.state = 'battle';
    announce(`A wild ${foe.name} appeared!`);
    drawBattle();
    openBattleMenu();
  }

  function drawHPBar(x,y,w, beast){
    const ratio = beast.hp / beast.maxHP;
    ctx.fillStyle = '#222'; ctx.fillRect(x,y,w,10);
    ctx.fillStyle = ratio>0.5 ? '#6ed38d' : (ratio>0.25 ? '#e4d85d' : '#e46a6a');
    ctx.fillRect(x,y, Math.floor(w*ratio), 10);
    ctx.strokeStyle = '#000'; ctx.strokeRect(x,y,w,10);
  }

  function drawBattle(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#142018'; ctx.fillRect(0,0,canvas.width,canvas.height);

    // foe plate
    ctx.fillStyle = '#1b2a21'; ctx.fillRect(380,60,220,60);
    ctx.fillStyle = game.battle.foe.color; ctx.fillRect(420,130,60,60);
    ctx.fillStyle = '#cfe9db'; ctx.font = '16px monospace';
    ctx.fillText(game.battle.foe.name + " Lv." + game.battle.foe.level, 388, 78);
    drawHPBar(388, 92, 200, game.battle.foe);

    // player plate
    ctx.fillStyle = '#1b242a'; ctx.fillRect(40,300,220,60);
    ctx.fillStyle = game.battle.player.color; ctx.fillRect(120,240,60,60);
    ctx.fillStyle = '#cfe9db';
    ctx.fillText(game.battle.player.name + " Lv." + game.battle.player.level, 48, 318);
    drawHPBar(48, 332, 200, game.battle.player);
  }

  function announce(text){
    showPanel(text, [{label:'Continue', onClick: ()=> { hidePanel(); }}]);
  }

  function openBattleMenu(){
    const opts = [
      {label:'Fight', onClick: openMoveMenu},
      {label:'Bind',  onClick: tryBind},
      {label:'Swap',  onClick: openSwapMenu},
      {label:'Run',   onClick: tryRun},
    ];
    showPanel("What will you do?", opts);
  }

  function openMoveMenu(){
    choicesEl.innerHTML = '';
    const moves = game.battle.player.moves;
    const opts = moves.map(mk => {
      const m = MOVES[mk];
      return { label: m.name, onClick: ()=> doPlayerMove(mk) };
    });
    opts.push({label:'Back', onClick: openBattleMenu});
    showPanel("Choose a move.", opts);
  }

  function openSwapMenu(){
    const opts = game.player.party.map((b, idx) => ({
      label: `${idx===0?'• ':''}${b.name} (${b.hp}/${b.maxHP})`,
      onClick: ()=> {
        if(idx===0){ showPanel("Already in battle.", [{label:'Back', onClick: openBattleMenu}]); return;}
        const cur = game.player.party[0];
        game.player.party[0] = b;
        game.player.party[idx] = cur;
        game.battle.player = JSON.parse(JSON.stringify(game.player.party[0]));
        drawBattle();
        enemyTurn();
      }
    }));
    opts.push({label:'Back', onClick: openBattleMenu});
    showPanel("Swap beasts:", opts);
  }

  function doDamage(attacker, defender, power) {
    const base = power + Math.floor(attacker.level / 2);
    const variance = Math.floor(Math.random()*6)-3;
    return clamp(base + variance, 1, 999);
  }

  function doPlayerMove(moveKey){
    hidePanel();
    const m = MOVES[moveKey];
    if(Math.random() > m.acc){
      announce(`${game.battle.player.name}'s ${m.name} missed!`);
      drawBattle();
      enemyTurn();
      return;
    }
    if(m.kind==='attack'){
      const dmg = doDamage(game.battle.player, game.battle.foe, m.power);
      game.battle.foe.hp = clamp(game.battle.foe.hp - dmg, 0, game.battle.foe.maxHP);
      announce(`${game.battle.player.name} used ${m.name}! It dealt ${dmg} damage.`);
    } else if(m.kind==='heal'){
      const heal = m.power + Math.floor(Math.random()*6);
      game.battle.player.hp = clamp(game.battle.player.hp + heal, 0, game.battle.player.maxHP);
      announce(`${game.battle.player.name} used ${m.name}! Restored ${heal} HP.`);
    }
    drawBattle();
    if(game.battle.foe.hp<=0){
      handleVictory();
    } else {
      enemyTurn();
    }
  }

  function enemyTurn(){
    setTimeout(()=>{
      const foe = game.battle.foe;
      const mvKey = foe.moves[Math.floor(Math.random()*foe.moves.length)];
      const m = MOVES[mvKey];
      if(m.kind==='attack' && Math.random() <= m.acc){
        const dmg = doDamage(foe, game.battle.player, m.power-4);
        game.battle.player.hp = clamp(game.battle.player.hp - dmg, 0, game.battle.player.maxHP);
        announce(`Wild ${foe.name} used ${m.name}! You took ${dmg} damage.`);
        drawBattle();
        if(game.battle.player.hp<=0){
          handleDefeat();
          return;
        }
      } else {
        announce(`Wild ${foe.name} missed!`);
      }
      openBattleMenu();
    }, 250);
  }

  function tryBind(){
    const foe = game.battle.foe;
    const ratio = foe.hp / foe.maxHP;
    let chance = 0.15;
    if(ratio < 0.5) chance += 0.25;
    if(ratio < 0.25) chance += 0.25;
    showPanel("Throw a Binding Shard?", [
      {label:"Yes", onClick: ()=> {
        hidePanel();
        if(Math.random() < chance && game.player.party.length < 6){
          game.player.party.push(JSON.parse(JSON.stringify(foe)));
          saveGame();
          announce(`Got it! ${foe.name} joined your party.`);
          endBattle();
        } else {
          announce(`It broke free!`);
          drawBattle();
          enemyTurn();
        }
      }},
      {label:"No", onClick: openBattleMenu}
    ]);
  }

  function tryRun(){
    if(Math.random()<0.75){
      announce("You fled successfully.");
      endBattle();
    } else {
      announce("Couldn't get away!");
      enemyTurn();
    }
  }

  function handleVictory(){
    announce(`Wild ${game.battle.foe.name} fainted! ${game.battle.player.name} feels stronger.`);
    game.player.party[0].hp = game.battle.player.hp;
    endBattle();
  }
  function handleDefeat(){
    announce(`${game.battle.player.name} fainted!`);
    const idx = game.player.party.findIndex(b=> b.hp>0);
    if(idx>0){
      const cur = game.player.party[0];
      game.player.party[0] = game.player.party[idx];
      game.player.party[idx] = cur;
      game.battle.player = JSON.parse(JSON.stringify(game.player.party[0]));
      drawBattle();
      openBattleMenu();
    } else {
      game.player.party.forEach(b=> b.hp = Math.max(1, Math.floor(b.maxHP*0.5)));
      announce("You stagger back to the village to recover...");
      endBattle();
    }
  }
  function endBattle(){
    game.state = 'map';
    game.wild = null; game.battle = null;
    hidePanel();
    drawMap();
  }

  // Starter selection
  function ensureStarter(){
    if(game.player.party.length===0){
      game.state='starter';
      const opts = STARTERS.map(id=>{
        const b = BESTIARY[id];
        return {
          label: b.name,
          onClick: ()=> {
            const inst = makeBeast(id);
            game.player.party.push(inst);
            saveGame();
            hidePanel();
            game.state='map';
            drawMap();
            showPanel(`You chose ${inst.name}!`, [{label:'Let's go', onClick: ()=> { hidePanel(); } }]);
          }
        }
      });
      showPanel("Choose your first companion:", opts);
    }
  }

  // Input system (keyboard + touch)
  const keys = new Set();
  window.addEventListener('keydown', (e)=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter','Escape','w','a','s','d','W','A','S','D'].includes(e.key)){
      e.preventDefault();
    }
    keys.add(e.key);
  });
  window.addEventListener('keyup', (e)=> keys.delete(e.key));

  // Touch buttons simulate keydown/keyup
  function bindTouchButtons(){
    const btns = document.querySelectorAll('#controls button');
    btns.forEach(btn => {
      const key = btn.getAttribute('data-key');
      const press = (e)=>{ e.preventDefault(); keys.add(key); };
      const release = (e)=>{ e.preventDefault(); keys.delete(key); };
      btn.addEventListener('touchstart', press, {passive:false});
      btn.addEventListener('touchend', release, {passive:false});
      btn.addEventListener('touchcancel', release, {passive:false});
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
    });
  }
  bindTouchButtons();

  // Movement loop
  let moveCooldown = 0;
  function update(dt){
    if(game.state==='map'){
      moveCooldown -= dt;
      if(moveCooldown<=0){
        let nx = game.player.x, ny = game.player.y;
        if(keys.has('ArrowUp')||keys.has('w')||keys.has('W')) ny--;
        else if(keys.has('ArrowDown')||keys.has('s')||keys.has('S')) ny++;
        else if(keys.has('ArrowLeft')||keys.has('a')||keys.has('A')) nx--;
        else if(keys.has('ArrowRight')||keys.has('d')||keys.has('D')) nx++;

        if(nx!==game.player.x || ny!==game.player.y){
          if(nx>=0 && nx<mapW && ny>=0 && ny<mapH){
            game.player.x = nx; game.player.y = ny;
            moveCooldown = 140; // slightly slower for touch
            if(map[ny][nx]===1 && Math.random()<0.12) startBattle(true);
            if(map[ny][nx]===3){
              game.player.party.forEach(b=> b.hp=b.maxHP);
              showPanel("You rest at the village. Your party is restored.", [{label:'Nice', onClick: ()=> { hidePanel(); }}]);
            }
          }
          drawMap();
        }
      }
    }
    requestAnimationFrame((t)=>{
      const now = performance.now();
      const delta = now - (update.last || now);
      update.last = now;
      update(delta);
    });
  }

  // Boot
  ctx.font = '16px monospace';
  if(game.state !== 'battle' && game.player.party.length>0) { game.state='map'; drawMap(); } else { drawMap(); }
  ensureStarter();
  resizeCanvas();
  update(0);
})();
