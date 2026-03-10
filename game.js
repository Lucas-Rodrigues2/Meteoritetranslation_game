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
  let spawnInterval = 4000; // ms (increased base spawn interval)
  let lastTime = 0;
  let score = 0;
  let lives = 3;
  let lostWords = []; // words that caused a life loss (for game over summary)
  let destroyedCount = 0; // count of successfully destroyed meteors (for pause every 10)
  let spawnCount = 0; // number of meteors spawned
  let pendingPause = false; // when true, wait for screen to be empty then pause 5s
  let running = false;
  let words = [];
  // language key detection
  const LANG_NAMES = {
    fr:'Français', en:'English', ja:'日本語', es:'Español',
    de:'Deutsch', it:'Italiano', pt:'Português', zh:'中文',
    ko:'한국어', ru:'Русский', ar:'العربية', nl:'Nederlands',
    sv:'Svenska', pl:'Polski', tr:'Türkçe', hi:'हिन्दी'
  };
  let langA = 'fr', langB = 'en'; // detected from word data
  // controls elements (will be looked up after DOM ready)
  const sliderLives = document.getElementById('sliderLives');
  const sliderSpeed = document.getElementById('sliderSpeed');
  const sliderSpawn = document.getElementById('sliderSpawn');
  const valLives = document.getElementById('valLives');
  const valSpeed = document.getElementById('valSpeed');
  const valSpawn = document.getElementById('valSpawn');
  const dirMode = document.getElementById('dirMode');
  const gameModeEl = document.getElementById('gameMode');

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

  // direction mode select (populated dynamically after words load)
  let currentDir = 'fr-en';
  if(dirMode){
    dirMode.addEventListener('change', ()=>{ currentDir = dirMode.value; });
  }

  // detect language keys from word data and populate direction dropdown
  function detectAndPopulateLangs(data){
    if(!Array.isArray(data) || data.length === 0) return;
    const keys = Object.keys(data[0]);
    if(keys.length >= 2){ langA = keys[0]; langB = keys[1]; }
    if(!dirMode) return;
    dirMode.innerHTML = '';
    const nameA = LANG_NAMES[langA] || langA;
    const nameB = LANG_NAMES[langB] || langB;
    [{v:`${langA}-${langB}`, t:`${nameA} → ${nameB}`},
     {v:`${langB}-${langA}`, t:`${nameB} → ${nameA}`},
     {v:'both', t:'Les deux'}].forEach(o=>{
      const opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.t;
      dirMode.appendChild(opt);
    });
    currentDir = dirMode.value;
    input.placeholder = 'Tapez la traduction...';
  }

  // game mode select (normal | random | final-boss)
  let gameMode = gameModeEl ? gameModeEl.value : 'normal';
  if(gameModeEl){ gameModeEl.addEventListener('change', ()=>{ gameMode = gameModeEl.value; }); }

  // helper: shuffle array
  function shuffle(a){
    for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }

  // mode-specific pool for final-boss
  let bossQueue = []; // for 'final-boss' mode: queue of words to finish

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
    // prevent duplicate words on screen
    const present = new Set(meteors.map(m=>m.word[langA]));
    let w = null;
    if(gameMode === 'final-boss'){
      // spawn next from bossQueue; if empty nothing to spawn
      if(bossQueue.length === 0) return;
      // find next word not already on screen; try up to bossQueue.length
      for(let i=0;i<bossQueue.length;i++){
        const cand = bossQueue[0];
        if(!present.has(cand[langA])){
          w = bossQueue.shift();
          break;
        } else {
          // rotate to try next
          bossQueue.push(bossQueue.shift());
        }
      }
      if(!w) return; // all remaining words are already displayed
    } else {
      // normal mode: choose any available word at random
      const available = words.filter(w2=>!present.has(w2[langA]));
      if(available.length===0) return; // no free words to spawn
      w = available[Math.floor(Math.random()*available.length)];
    }
    const fontSize = 26 + Math.random()*14;
    const base = 40 + Math.random()*80;
    // decide which side to display based on mode
    let showSide = langA;
    if(currentDir === 'both') showSide = (Math.random() < 0.5) ? langA : langB;
    else showSide = currentDir.split('-')[0];

  // length-based factor: base it on the word the player must type (the answer)
  const answerWord = w[showSide === langA ? langB : langA]; // player types the opposite side
  const len = Math.max(1, (answerWord||'').length);
  // map length to factor: longer answer => slower fall.
  // stronger mapping so effect is more noticeable
  const lengthFactor = Math.max(0.4, Math.min(1.8, 1.8 - len*0.08));

    const meter = {
      x: Math.random()*(width-120)+60,
      y: -50,
      baseSpeed: base,
      lengthFactor,
      speed: base * lengthFactor * speedMultiplier,
      word: w,
      show: showSide, // which language key is visible on the meteor
      fontSize
    };
    meteors.push(meter);
    // increment spawn counter and mark pending pause every 10 spawns
    spawnCount += 1;
    if(spawnCount % 10 === 0){ pendingPause = true; }
  }

  function startGame(){
    meteors = [];
    lostWords = [];
    destroyedCount = 0;
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
    // initialize mode-specific pools
    if(gameMode === 'final-boss'){
      bossQueue = shuffle(words.slice());
    }
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
    // load high score from localStorage
    const prevHigh = parseInt(localStorage.getItem('mt_highscore') || '0', 10);
    let newHigh = prevHigh;
    if(score > prevHigh){
      localStorage.setItem('mt_highscore', String(score));
      newHigh = score;
    }
    // prepare lost words list HTML
    let lostHtml = '<em>Aucun</em>';
    if(lostWords.length>0){
      lostHtml = '<ul>' + lostWords.map(w=>{
        const left = w.word[w.shown];
        const right = w.word[w.shown === langA ? langB : langA];
        return `<li>${left} → ${right}</li>`;
      }).join('') + '</ul>';
    }
    el.innerHTML = `<div style="text-align:center">\n      <strong>Game Over</strong><br>\n      Score: ${score} <br>\n      Meilleur score: ${newHigh} <br>\n      <div style=\"margin-top:8px;text-align:left;display:inline-block;max-width:420px\">\n        <div style=\"font-weight:600;margin-bottom:6px\">Mots qui ont causé une perte de vie:</div>\n        ${lostHtml}\n      </div>\n      <div style=\"margin-top:10px\"><button id=\"go-restart\">Recommencer</button></div>\n    </div>`;
    document.body.appendChild(el);
    // hide bottom UI (input + restart) on game over
    if(gameBottom) gameBottom.style.display = 'none';
    document.getElementById('go-restart').addEventListener('click', ()=>{
      el.remove();
      // behave like the restart-bottom button: show settings and hide game bottom
      running = false;
      ui.classList.add('show-controls');
      if(gameBottom) gameBottom.style.display = 'none';
      const go = document.querySelector('.game-over'); if(go) go.remove();
      input.focus();
    });
  }

  function showVictory(){
    let el = document.createElement('div');
    el.className = 'game-over';
    el.innerHTML = `<div style="text-align:center">\n      <strong>Victoire !</strong><br>\n      Vous avez terminé la liste. Score: ${score} <br>\n      <div style=\"margin-top:10px\"><button id=\"go-restart\">Recommencer</button></div>\n    </div>`;
    document.body.appendChild(el);
    if(gameBottom) gameBottom.style.display = 'none';
    document.getElementById('go-restart').addEventListener('click', ()=>{
      el.remove();
      running = false;
      ui.classList.add('show-controls');
      if(gameBottom) gameBottom.style.display = 'none';
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

    // If a pending pause was scheduled (every 10 spawns), wait until screen is empty then pause silently
    if(pendingPause && meteors.length === 0){
      // clear canvas so the last meteor doesn't remain visible
      ctx.clearRect(0,0,width,height);
      pendingPause = false;
      running = false;
      setTimeout(()=>{
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(loop);
        input.focus();
      }, 5000);
      return; // exit loop until resumed
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
  // text (show the word in the displayed language)
  ctx.fillStyle = '#fff';
  ctx.font = `${m.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  const textToShow = m.word[m.show];
  ctx.fillText(textToShow, m.x, m.y + 6);

      if(m.y > height - 20){
        // meteor reached bottom: record the word that caused the life loss
        const removed = meteors.splice(i,1)[0];
        lostWords.push({word: removed.word, shown: removed.show});
        // If in final-boss mode, re-add this word to the end of the queue so player must face it again
        if(gameMode === 'final-boss'){
          bossQueue.push(removed.word);
        }
        lives -= 1;
        updateUI();
        if(lives<=0){ endGame(); return; }
        // if in final-boss, check victory condition (if queue empty and no meteors)
        if(gameMode === 'final-boss' && bossQueue.length === 0 && meteors.length === 0){
          running = false;
          showVictory();
          return;
        }
      }
    }
    requestAnimationFrame(loop);
  }

  // helper: strip accents/diacritics for tolerant comparison
  function stripAccents(s){
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
  }

  // accent correction bubble
  const accentBubble = document.getElementById('accent-bubble');
  let bubbleTimeout = null;
  function showAccentBubble(correctWord){
    if(!accentBubble) return;
    accentBubble.textContent = correctWord;
    accentBubble.classList.add('show');
    if(bubbleTimeout) clearTimeout(bubbleTimeout);
    bubbleTimeout = setTimeout(()=>{ accentBubble.classList.remove('show'); }, 3000);
  }

  // input handling
  input.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){
      const val = input.value.trim().toLowerCase();
      if(!val) return;
      for(let i=meteors.length-1;i>=0;i--){
        const answer = meteors[i].word[meteors[i].show === langA ? langB : langA];
        const exactMatch = answer.toLowerCase() === val;
        const tolerantMatch = !exactMatch && stripAccents(answer.toLowerCase()) === stripAccents(val);
        if(exactMatch || tolerantMatch){
          meteors.splice(i,1);
          score += 10;
          updateUI();
          input.value = '';
          if(tolerantMatch) showAccentBubble(answer);
          return;
        }
      }
      // wrong guess: do not remove life. Provide visual feedback instead.
      input.classList.add('wrong');
      setTimeout(()=> input.classList.remove('wrong'), 300);
      input.value = '';
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
    if(Array.isArray(data) && data.length>0){ words = data; detectAndPopulateLangs(words); console.log('Loaded words.json', words.length, 'words'); }
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
      detectAndPopulateLangs(words);
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
          if(Array.isArray(data) && data.length>0){
            words = data;
            detectAndPopulateLangs(words);
            // initialize mode pools for the newly loaded words
            if(gameMode === 'random') poolRandom = shuffle(words.slice());
            if(gameMode === 'final-boss') bossQueue = shuffle(words.slice());
            alert('Liste chargée: '+data.length+' mots');
          } else alert('Fichier invalide: format attendu JSON array');
        }catch(err){ alert('Erreur lecture JSON: '+err.message); }
      };
      reader.readAsText(f);
    });
  }

});
