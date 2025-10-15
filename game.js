// Petit jeu: météorites avec mots français; il faut taper la traduction anglaise pour les détruire.

window.addEventListener('load', ()=>{
  console.log('Game init: DOM loaded');

  // DOM elements
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const input = document.getElementById('input');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const startBtn = document.getElementById('start');
  const ui = document.getElementById('ui');
  const gameBottom = document.getElementById('game-bottom');
  const restartBottom = document.getElementById('restart-bottom');

  let width = 800, height = 600;
  let meteors = [];
  let spawnTimer = 0; // ms accumulator
  let spawnInterval = 1500; // ms
  let lastTime = 0;
  let score = 0;
  let lives = 3;
  let running = false;
  let words = [];
  // controls elements (will be looked up after DOM ready)
  const sliderLives = document.getElementById('sliderLives');
  const sliderSpeed = document.getElementById('sliderSpeed');
  const sliderSpawn = document.getElementById('sliderSpawn');
  const valLives = document.getElementById('valLives');
  const valSpeed = document.getElementById('valSpeed');
  const valSpawn = document.getElementById('valSpawn');
  const dirMode = document.getElementById('dirMode');

  // initial values from sliders
  lives = parseInt(sliderLives.value, 10) || 3;
  valLives.textContent = lives;
  let speedMultiplier = parseFloat(sliderSpeed.value) || 1.0;
  valSpeed.textContent = speedMultiplier.toFixed(2) + '×';
  spawnInterval = parseInt(sliderSpawn.value, 10) || 1500;
  valSpawn.textContent = (spawnInterval/1000).toFixed(1) + 's';

  // slider events
  sliderLives.addEventListener('input', ()=>{
    const v = parseInt(sliderLives.value,10);
    valLives.textContent = v;
    // change current lives without resetting the game
    const diff = v - lives;
    lives = v;
    if(diff>0) updateUI();
    else updateUI();
  });
  sliderSpeed.addEventListener('input', ()=>{
    speedMultiplier = parseFloat(sliderSpeed.value);
    valSpeed.textContent = speedMultiplier.toFixed(2) + '×';
    // apply multiplier to existing meteors' speeds (respect lengthFactor if present)
    for(const m of meteors){ m.speed = (m.baseSpeed || m.speed) * (m.lengthFactor || 1) * speedMultiplier; }
  });
  sliderSpawn.addEventListener('input', ()=>{
    spawnInterval = parseInt(sliderSpawn.value,10);
    valSpawn.textContent = (spawnInterval/1000).toFixed(1) + 's';
  });

  // direction mode select
  let currentDir = dirMode ? dirMode.value : 'fr-en';
  if(dirMode){
    dirMode.addEventListener('change', ()=>{ currentDir = dirMode.value; });
  }

  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    width = canvas.width; height = canvas.height;
  }
  window.addEventListener('resize', resize);
  resize();

  function updateUI(){
    scoreEl.textContent = `Score: ${score}`;
    livesEl.textContent = `Vies: ${lives}`;
  }

  function spawnMeteor(){
    if(words.length===0) return;
    // prevent duplicate french words on screen
    const present = new Set(meteors.map(m=>m.fr));
    const available = words.filter(w=>!present.has(w.fr));
    if(available.length===0) return; // no free words to spawn
    const w = available[Math.floor(Math.random()*available.length)];
    const fontSize = 26 + Math.random()*14;
    const base = 40 + Math.random()*80;
    // decide which side to display based on mode
    let showSide = 'fr';
    if(currentDir === 'both') showSide = (Math.random() < 0.5) ? 'fr' : 'en';
    else if(currentDir === 'en-fr') showSide = 'en';

    // length-based factor: longer words => slower
    const wordToType = showSide === 'en' ? w.en : w.fr;
    const len = Math.max(1, (wordToType||'').length);
    // map length to factor between 0.6 (long) and 1.4 (short)
    const lengthFactor = Math.max(0.6, Math.min(1.4, 1.6 - len*0.07));

    const meter = {
      x: Math.random()*(width-120)+60,
      y: -50,
      baseSpeed: base,
      lengthFactor,
      speed: base * lengthFactor * speedMultiplier,
      fr: w.fr,
      en: w.en,
      show: showSide, // which side is visible on the meteor
      fontSize
    };
    meteors.push(meter);
  }

  function startGame(){
    meteors = [];
    spawnTimer = 0;
    lastTime = performance.now();
    score = 0;
    // read current control values so restart respects them
    lives = parseInt(sliderLives.value, 10) || 3;
    spawnInterval = parseInt(sliderSpawn.value, 10) || 1500;
    speedMultiplier = parseFloat(sliderSpeed.value) || 1.0;
  // ensure existing meteors (if any) use multiplier and length factor
  for(const m of meteors){ m.speed = (m.baseSpeed || m.speed) * (m.lengthFactor || 1) * speedMultiplier; }
    updateUI();
    running = true;
    console.log('Game started');
    // immediate feedback: spawn one meteor right away so the user sees something
    spawnMeteor();
    requestAnimationFrame(loop);
  }

  function endGame(){
    running = false;
    showGameOver();
  }

  function showGameOver(){
    let el = document.createElement('div');
    el.className = 'game-over';
    el.innerHTML = `<div>Game Over<br>Score: ${score}<br><button id="go-restart">Recommencer</button></div>`;
    document.body.appendChild(el);
    // hide bottom UI (input + restart) on game over
    if(gameBottom) gameBottom.style.display = 'none';
    document.getElementById('go-restart').addEventListener('click', ()=>{
      el.remove();
      // show controls and require the user to press Start
      ui.classList.add('show-controls');
      running = false;
      input.focus();
    });
  }

  function loop(ts){
    if(!running) return;
    const dt = (ts - lastTime)/1000;
    lastTime = ts;

    // spawn timer
    spawnTimer += dt*1000;
    if(spawnTimer > spawnInterval){
      spawnMeteor();
      spawnTimer -= spawnInterval;
      if(spawnInterval>600) spawnInterval *= 0.995;
    }

    // update/draw
    ctx.clearRect(0,0,width,height);
    // debug overlay removed
    for(let i=meteors.length-1;i>=0;i--){
      const m = meteors[i];
      m.y += m.speed * dt;
      // draw meteor
      ctx.beginPath();
      ctx.fillStyle = '#b5651d';
      ctx.arc(m.x, m.y, m.fontSize/2 + 8, 0, Math.PI*2);
      ctx.fill();
  // text (show either fr or en depending on meteor.show)
  ctx.fillStyle = '#fff';
  ctx.font = `${m.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  const textToShow = m.show === 'en' ? m.en : m.fr;
  ctx.fillText(textToShow, m.x, m.y + 6);

      if(m.y > height - 20){
        meteors.splice(i,1);
        lives -= 1;
        updateUI();
        if(lives<=0){ endGame(); return; }
      }
    }
    requestAnimationFrame(loop);
  }

  // input handling
  input.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){
      const val = input.value.trim().toLowerCase();
      if(!val) return;
      for(let i=meteors.length-1;i>=0;i--){
        // check according to visible side
        const visible = meteors[i].show === 'fr' ? meteors[i].fr : meteors[i].en;
        const answer = meteors[i].show === 'fr' ? meteors[i].en : meteors[i].fr;
        if(answer.toLowerCase() === val){
          meteors.splice(i,1);
          score += 10;
          updateUI();
          input.value = '';
          return;
        }
      }
      // wrong guess
      lives -= 1;
      updateUI();
      input.value = '';
      if(lives<=0) endGame();
    }
  });

  // Start button: hide controls/menu and show game bottom UI then begin
  startBtn.addEventListener('click', ()=>{
    ui.classList.remove('show-controls');
    if(gameBottom) gameBottom.style.display = 'flex';
    startGame();
    input.focus();
  });

  // (top restart removed) - use bottom restart during gameplay to return to settings

  // Restart bottom button (shown during the game): behave like top restart
  restartBottom.addEventListener('click', ()=>{
    running = false;
    ui.classList.add('show-controls');
    if(gameBottom) gameBottom.style.display = 'none';
    const go = document.querySelector('.game-over'); if(go) go.remove();
  });
  window.addEventListener('click', ()=>input.focus());
  input.focus();

  // Show controls at initial load
  ui.classList.add('show-controls');
  if(gameBottom) gameBottom.style.display = 'none';

  // Use an embedded list of words only (no fetch/server)
  // Try fetching words.json first (works when served via http)
  fetch('words.json').then(r=>r.json()).then(data=>{
    if(Array.isArray(data) && data.length>0){ words = data; console.log('Loaded words.json', words.length, 'words'); }
  }).catch(err=>{
    console.warn('Could not load words.json, will use embedded list unless user loads one', err);
  }).finally(()=>{
    if(words.length===0){
      words = [
        {fr:'chat', en:'cat'},
        {fr:'chien', en:'dog'},
        {fr:'maison', en:'house'},
        {fr:'soleil', en:'sun'},
        {fr:'lune', en:'moon'},
        {fr:'voiture', en:'car'},
        {fr:'pomme', en:'apple'},
        {fr:'eau', en:'water'},
        {fr:'feu', en:'fire'},
        {fr:'arbre', en:'tree'}
      ];
      console.log('Using embedded words list', words.length, 'words');
    }
  });

  // load words from file input
  const loadWordsBtn = document.getElementById('loadWordsBtn');
  const loadWordsFile = document.getElementById('loadWordsFile');
  if(loadWordsBtn && loadWordsFile){
    loadWordsBtn.addEventListener('click', ()=> loadWordsFile.click());
    loadWordsFile.addEventListener('change', (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = (ev)=>{
        try{
          const data = JSON.parse(ev.target.result);
          if(Array.isArray(data) && data.length>0){ words = data; alert('Liste chargée: '+data.length+' mots'); }
          else alert('Fichier invalide: format attendu JSON array');
        }catch(err){ alert('Erreur lecture JSON: '+err.message); }
      };
      reader.readAsText(f);
    });
  }

});
