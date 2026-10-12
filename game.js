(() => {
  'use strict';
  const cfg = window.GAME_CONFIG;
  const world = cfg.world;
  const T = 32;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const $ = id => document.getElementById(id);
  const ui = {
    dialogue: $('dialogue'), speaker: $('dialogueSpeaker'), text: $('dialogueText'), next: $('dialogueNext'),
    prompt: $('interactPrompt'), promptLabel: $('interactLabel'),
    overlay: $('gameOverlay'), battle: $('battlePanel'), cutscene: $('cutscenePanel'), finale: $('finalPanel'), battleLog: $('battleLog'),
    battleHeading: $('battleHeading'), battleTurn: $('battleTurn'), enemyName: $('enemyName'), heroHearts: $('heroHearts'), bossHearts: $('bossHearts'),
    attack: $('attackButton'), defend: $('defendButton'), super: $('superButton'), salad: $('saladButton'),
    battleHero: $('battleHero'), battleEnemy: $('battleEnemy'), battleFx: $('battleFx'), deathText: $('deathText'),
    finalTitle: $('finalTitle'), finalSubtitle: $('finalSubtitle'),
    death: $('deathPanel'), secret: $('secretPanel')
  };
  const palette = {
    outline: '#242837', floor: '#925559', light: '#b8726a', seam: '#603e4a', wall: '#d2c6b8',
    cream: '#f5e8cd', shadow: '#202433', teal: '#58b1bd', gold: '#f0c46c', rose: '#d96b64',
    wood: '#83515a', woodLight: '#b77a6d', green: '#438b72', greenLight: '#78be93'
  };
  const state = {
    phase: 'explore', player: { x: world.start.x, y: world.start.y, dir: 'down', step: 0 },
    collected: new Set(), introQuestsUnlocked: false, wrongSockSeen: 0, wrongSockStreak: 0, catDisappointedUntil: 0,
    catTalkStreak: 0, catTalkText: null, catEasterSeen: false,
    saladFound: false, secretOpen: false, dialogueQueue: [], dialogueDone: null,
    keys: new Set(), nearest: null, time: 0, particles: [], sound: true, audio: null,
    audioUnlocked: false, music: {}, activeMusic: null, exploreIntroCompleted: false,
    victoryClip: null, victoryPlaying: false, cutsceneVoice: null, cutsceneVoiceStarted: false,
    battleKind: 'vacuum', battle: { hp: 3, bossHp: 5, attacks: 0, shield: false, busy: false, saladUsed: false }, battleFxSeq: 0, timers: []
  };
  const questRows = Object.fromEntries([...document.querySelectorAll('.quest-row')].map(row => [row.dataset.quest, row]));
  function renderQuests() {
    const count=state.collected.size;
    for(const id of ['sock','mug','snack','boss','gift']) {
      let status;
      if(id==='boss') {
        status=state.battleKind==='vacuum'&&state.phase==='battle'?'battle':state.battleKind==='vacuum'&&state.phase==='dead'?'retry':state.battleKind==='vacuum'&&['victory','cutscene','won','final'].includes(state.phase)?'won':count===3?'ready':'locked';
      } else if(id==='gift') {
        status=state.phase==='final'?'received':state.phase==='won'?'giftReady':'locked';
      } else if(id==='sock'&&state.battleKind==='couch'&&(state.phase==='battle'||state.phase==='dead')) {
        status=state.phase==='battle'?'battle':'retry';
      } else status=state.collected.has(id)?'found':'searching';
      const row=questRows[id];
      row.hidden=!state.introQuestsUnlocked||((id==='boss'||id==='gift')&&count<3);
      row.querySelector('.quest-name').textContent=cfg.text.questLabels[id];
      row.querySelector('.quest-state').textContent=cfg.text.questStatuses[status];
      row.dataset.status=status;
      row.dataset.state=['found','won','received'].includes(status)?'done':status==='locked'?'locked':'active';
    }
  }
  function renderInventory() {
    const hasOlivier=state.saladFound&&!state.battle.saladUsed;
    $('inventoryEmpty').hidden=hasOlivier;
    $('inventoryOlivier').hidden=!hasOlivier;
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function stroke(x, y, w, h, color = palette.outline, size = 2) {
    rect(x, y, w, size, color); rect(x, y + h - size, w, size, color);
    rect(x, y, size, h, color); rect(x + w - size, y, size, h, color);
  }
  function hash(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }
  function furnitureBounds(f) { return { x: f.x * T, y: f.y * T, w: f.w * T, h: f.h * T }; }
  function drawFloor() {
    rect(0, 0, canvas.width, canvas.height, '#1e2431');
    for (let y = 1; y < world.height - 1; y++) {
      for (let x = 1; x < world.width - 1; x++) {
        const c = x < world.partitions[0].x ? ['#94565b','#a45e62','#8b515a'] : x < world.partitions[1].x ? ['#92545c','#aa6063','#995960'] : ['#8d545d','#9c6063','#87505b'];
        rect(x*T, y*T, T, T, c[hash(x,y)%3]);
        rect(x*T+31, y*T, 1, T, '#583a48');
        if(y%3===0)rect(x*T+1,y*T+30,T-2,2,'#6c414e');
        if (hash(x,y)%4 === 0) rect(x*T+8, y*T+12, 1, 11, '#b36c69');
        if (hash(x,y)%7 === 0) rect(x*T+20, y*T+4, 1, 16, '#794451');
      }
    }
    drawRugs();
    for (let x = 0; x < world.width; x++) { drawWallTile(x,0); drawWallTile(x,world.height-1); }
    for (let y = 1; y < world.height-1; y++) { drawWallTile(0,y); drawWallTile(world.width-1,y); }
    for (const p of world.partitions) {
      for (let y = 1; y < world.height-1; y++) {
        if (y >= p.doorFrom && y <= p.doorTo) {
          rect(p.x*T, y*T, T, T, '#a05d5d');
          rect(p.x*T+4, y*T, 3, T, '#5b3a4b');
          rect(p.x*T+25, y*T, 3, T, '#5b3a4b');
        } else drawWallTile(p.x,y);
      }
      rect(p.x*T-3,p.doorFrom*T-5,T+6,5,'#27303f');
      rect(p.x*T-3,(p.doorTo+1)*T,T+6,5,'#27303f');
    }
    drawWindow(73, 3, 81, 'grey');
    drawWindow(376, 3, 101, 'yellow');
    drawWindow(664, 3, 66, 'blue');
    drawDeerAntlers(world.antlers.x*T, world.antlers.y*T);
  }
  function drawExit() {
    const x=Math.round(world.exit.x*T-25),y=(world.height-1)*T;
    rect(x-3,y-4,56,36,'#192433');
    rect(x,y-2,50,32,'#d5b894');
    rect(x+4,y+1,42,28,'#694637');
    rect(x+7,y+4,36,22,'#a8744f');
    rect(x+11,y+7,28,9,'#81553e');
    rect(x+11,y+19,28,5,'#81553e');
    rect(x+36,y+17,4,4,'#f1d082');
    rect(x-3,y-4,56,3,'#efdcba');
  }
  function drawWindow(x,y,w,curtain) {
    rect(x-3,y-1,w+6,23,'#242b38');
    rect(x,y+2,w,17,'#4d8093');
    rect(x+4,y+3,w-8,12,'#94c4c4');
    rect(x+w/2-2,y,4,19,'#d9ccba');
    rect(x-2,y-1,9,25,'#236e6e');
    rect(x+w-7,y-1,9,25,'#236e6e');
    rect(x+7,y+18,w-14,4,'#1d525d');
    if(curtain) {
      const colors=curtain==='grey'
        ? {dark:'#606e79',main:'#89949d',light:'#b8bfc1'}
        : curtain==='yellow'
          ? {dark:'#9c713f',main:'#d6aa58',light:'#f3d47d'}
          : {dark:'#365475',main:'#527da3',light:'#91b5cd'};
      rect(x-5,y-2,w+10,3,'#414450');
      rect(x-7,y-3,5,5,'#d6bb8f');rect(x+w+2,y-3,5,5,'#d6bb8f');
      for(const side of [0,1]) {
        const edge=side ? x+w-21 : x+2;
        rect(edge,y+2,19,39,colors.dark);
        rect(edge+3,y+3,6,35,colors.main);
        rect(edge+11,y+3,5,36,colors.light);
        rect(edge+2,y+36,17,5,colors.main);
        rect(edge+1,y+25,19,3,'#d2c2a8');
        rect(edge+8,y+26,3,3,'#f0d9ac');
      }
    }
  }
  function drawDeerAntlers(x,y) {
    // Mounted on the living-room side of the partition, beside the sofa.
    rect(x-11,y-10,22,29,'#292b37');
    rect(x-8,y-7,16,23,'#744d3d');
    rect(x-5,y-4,10,17,'#a67550');
    for(const side of [-1,1]) {
      ctx.save();ctx.translate(x,y);ctx.scale(side,1);
      rect(3,-9,5,7,'#ead29d');
      rect(7,-15,5,9,'#f5dfae');
      rect(11,-20,5,9,'#f5dfae');
      rect(15,-24,6,7,'#f5dfae');
      rect(20,-30,5,10,'#f5dfae');
      rect(13,-32,4,7,'#f5dfae');
      rect(10,-26,4,6,'#f5dfae');
      rect(18,-20,8,4,'#e8cb96');
      rect(25,-25,5,8,'#f5dfae');
      rect(27,-31,4,8,'#f5dfae');
      ctx.restore();
    }
    rect(x-4,y-4,8,12,'#f5dfae');
    rect(x-2,y+7,4,4,'#e8cb96');
    rect(x-2,y-1,1,2,'#513d3b');rect(x+2,y-1,1,2,'#513d3b');
    // A fine green garland follows the antlers; the tiny bulbs glow in warm colours.
    for(const side of [-1,1]) {
      rect(x+side*10,y-20,7,2,'#467f67');
      rect(x+side*20,y-26,6,2,'#467f67');
      rect(x+side*16,y-22,2,5,'#467f67');
      rect(x+side*14,y-23,4,4,'#f5ca65');
      rect(x+side*26,y-29,4,4,'#f28c72');
      rect(x+side*23,y-28,2,2,'#fff2b4');
    }
  }
  function drawWallTile(x,y) {
    const px=x*T,py=y*T;
    rect(px,py,T,T,'#242b38');
    rect(px+3,py+2,T-6,T-8,'#d5c6b5');
    rect(px+3,py+2,T-6,6,'#b9b4ae');
    rect(px+6,py+10,2,14,'#9bb5ae');
    rect(px+14,py+10,2,14,'#9bb5ae');
    rect(px+22,py+10,2,14,'#9bb5ae');
    rect(px,py+25,T,7,'#434457');
    rect(px,py+25,T,2,'#899ba2');
  }
  function drawRugs() {
    for(const r of world.rugs) {
      if(r.type==='sheepskin') drawSheepskin(r.x*T,r.y*T,r.w*T,r.h*T);
      else if(r.type==='round') drawRoundRug(r.x*T,r.y*T,r.w*T,r.h*T);
      else rug(r.x*T,r.y*T,r.w*T,r.h*T,r.base,r.trim);
    }
  }
  function drawRoundRug(x,y,w,h) {
    const cx=Math.round(x+w/2),cy=Math.round(y+h/2),radius=Math.round(Math.min(w,h)/2);
    const bands=[
      [radius+3,'#453c42'],[radius,'#766657'],[radius-8,'#4c5c69'],
      [radius-19,'#a2adac'],[radius-29,'#bd6d83'],
      [radius-39,'#ded4bf'],[radius-48,'#40576b'],[radius-58,'#a76d78']
    ];
    for(const [r,color] of bands) {
      for(let dy=-r;dy<=r;dy+=3) {
        const half=Math.floor(Math.sqrt(r*r-dy*dy));
        rect(cx-half,cy+dy,half*2+1,3,color);
      }
    }
    const flecks=['#d3c5ab','#a6b6ba','#c57b88','#786a62','#e2d6c2'];
    for(let i=0;i<230;i++) {
      const dx=(hash(i,37)%133)-66,dy=(hash(i,91)%133)-66;
      if(dx*dx+dy*dy<(radius-5)*(radius-5))
        rect(cx+dx,cy+dy,2+(i%3),2,flecks[hash(i,13)%flecks.length]);
    }
  }
  function drawSheepskin(x,y,w,h) {
    const pieces=[
      [.24,.04,.52,.92],[.12,.15,.76,.70],[.04,.26,.92,.49],
      [0,.38,1,.25],[.18,0,.21,.19],[.61,0,.21,.19],
      [.12,.76,.23,.23],[.65,.76,.23,.23]
    ];
    for(const [a,b,c,d] of pieces)rect(x+a*w+3,y+b*h+5,c*w,d*h,'#554b51');
    for(const [a,b,c,d] of pieces)rect(x+a*w,y+b*h,c*w,d*h,'#edece3');
    rect(x+w*.17,y+h*.35,w*.66,h*.29,'#fffdf3');
    rect(x+w*.25,y+h*.17,w*.5,h*.14,'#f8f5e9');
    rect(x+w*.25,y+h*.68,w*.5,h*.13,'#f8f5e9');
    for(let i=0;i<15;i++) {
      const px=x+16+(i*37)%Math.round(w-32),py=y+16+(i*53)%Math.round(h-32);
      rect(px,py,8,3,'#dfdcd3');
    }
  }
  function rug(x,y,w,h,base,line) {
    rect(x+4,y+4,w,h,'#422f3f'); rect(x,y,w,h,base); stroke(x,y,w,h,'#2d3443',3);
    stroke(x+11,y+11,w-22,h-22,line,3);
    for(let i=0;i<Math.floor((w-28)/18);i++){
      rect(x+16+i*18,y+17,6,4,line); rect(x+16+i*18,y+h-21,6,4,line);
    }
    for(let i=0;i<Math.floor((h-28)/18);i++){
      rect(x+17,y+18+i*18,4,6,line); rect(x+w-21,y+18+i*18,4,6,line);
    }
  }
  function drawFurniture(f) {
    const {x,y,w,h}=furnitureBounds(f);
    rect(x+5,y+7,w,h,'#25263488');
    switch(f.type) {
      case 'bed':
        rect(x,y,w,h,'#3b3a4b'); stroke(x,y,w,h);
        rect(x+5,y+6,w-10,h-12,'#ddd6c4');
        rect(x+9,y+12,w-18,27,'#ece7d6');
        rect(x+11,y+42,w-22,h-53,'#3bacc0');
        rect(x+11,y+42,w-22,6,'#b1e1da');
        rect(x+15,y+51,w-30,2,'#6ac6c7');
        rect(x+16,y+18,27,14,'#f5f1dc');rect(x+w-43,y+18,27,14,'#f5f1dc');
        rect(x+17,y+h-16,w-34,3,'#1e788e');
        break;
      case 'wardrobe':
        rect(x,y,w,h,'#654753'); stroke(x,y,w,h);
        rect(x+6,y+6,(w-15)/2,h-12,'#996470'); rect(x+w/2+2,y+6,(w-15)/2,h-12,'#996470');
        rect(x+w/2-9,y+h/2,4,5,'#efc56c'); rect(x+w/2+6,y+h/2,4,5,'#efc56c');
        rect(x+7,y+7,w-14,2,'#c48a7d');
        break;
      case 'chair':
        rect(x+5,y+4,w-10,h-10,'#24303d');
        rect(x+8,y+7,w-16,35,'#dba94f');rect(x+11,y+10,w-22,28,'#f3d46d');
        rect(x+5,y+38,w-10,22,'#c8903f');rect(x+9,y+42,w-18,14,'#f1cf69');
        rect(x+1,y+36,9,22,'#a87137');rect(x+w-10,y+36,9,22,'#a87137');
        rect(x+6,y+h-9,7,8,'#3d3940');rect(x+w-13,y+h-9,7,8,'#3d3940');
        rect(x+16,y+20,2,8,'#a87843');rect(x+19,y+18,2,8,'#a87843');rect(x+22,y+21,2,8,'#a87843');
        break;
      case 'nightstand':
        rect(x,y,w,h,'#70515c'); stroke(x,y,w,h);rect(x+4,y+5,w-8,7,'#bd8172');rect(x+8,y+15,w-16,2,'#efcc8a');rect(x+8,y+22,w-16,2,'#efcc8a');break;
      case 'counter':
        rect(x,y,w,h,'#6c4a54'); stroke(x,y,w,h);rect(x+3,y+3,w-6,16,'#ddc7ad');
        for(let i=0;i<4;i++){rect(x+8+i*(w-18)/4,y+25,(w-25)/4,h-30,'#a37370');rect(x+18+i*(w-18)/4,y+32,3,4,'#efcc8a');}
        rect(x+20,y+6,32,10,'#668d95');rect(x+24,y+9,24,4,'#304a62');
        rect(x+w-49,y+7,22,7,'#c87f70');
        drawCoffeeCup(x+w-77,y+14,'#bd7865','#eab89c');
        break;
      case 'fridge':
        rect(x,y,w,h,'#6b8c95');stroke(x,y,w,h);rect(x+5,y+5,w-10,h-10,'#bfd5ce');rect(x+5,y+35,w-10,3,'#537b87');rect(x+8,y+16,4,12,'#618a91');rect(x+8,y+44,4,12,'#618a91');rect(x+w-15,y+10,7,7,'#d8736b');break;
      case 'table':
        rect(x+3,y+5,w,h,'#3e4d5a');rect(x,y,w,h-5,'#d6d9d0');stroke(x,y,w,h-5,'#3f4d59',3);
        rect(x+6,y+6,w-12,h-17,'#f3efdf');rect(x+17,y+16,29,19,'#d8c5a8');rect(x+22,y+20,19,11,'#f3dfba');
        drawCoffeeCup(x+w-25,y+25,'#738f8d','#b0c6b5');
        break;
      case 'couch':
        ctx.save();ctx.translate(0,2*y+h);ctx.scale(1,-1);
        rect(x,y,w,h,'#533b36');stroke(x,y,w,h);rect(x+5,y+5,w-10,h-10,'#895e48');
        rect(x+8,y+5,w-16,15,'#6a463b');rect(x+12,y+8,w-24,8,'#ae7957');
        rect(x+5,y+17,15,h-23,'#704938');rect(x+w-20,y+17,15,h-23,'#704938');
        for(let i=0;i<3;i++) {
          const cw=(w-42)/3,cx=x+21+i*cw;
          rect(cx,y+22,cw-3,h-32,'#bd8861');
          rect(cx+4,y+26,cw-11,h-42,'#d1a075');
          rect(cx,y+h-13,cw-3,4,'#80533e');
        }
        rect(x+w-61,y+15,31,h-19,'#dcc38a');
        rect(x+w-59,y+18,27,5,'#689c9a');
        rect(x+w-59,y+29,27,3,'#fbebc7');
        rect(x+w-59,y+40,27,4,'#689c9a');
        rect(x+8,y+h-5,10,4,'#302c32');rect(x+w-18,y+h-5,10,4,'#302c32');
        ctx.restore();break;
      case 'tv':
        rect(x,y,w,h,'#3d4658');stroke(x,y,w,h);rect(x+5,y+4,w-10,h-13,'#22364c');
        rect(x+9,y+8,w-18,h-21,'#4d8793');rect(x+13,y+12,7,7,'#b7d9c9');rect(x+20,y+h-9,10,4,'#ae7c70');break;
      case 'desk':
        rect(x,y,w,h,'#523d3d');stroke(x,y,w,h);
        rect(x+5,y+5,w-10,h-17,'#b77e59');rect(x+9,y+9,w-18,h-25,'#d19a6c');
        rect(x+23,y+6,w-44,30,'#25313e');rect(x+27,y+10,w-52,21,'#6db5bd');
        rect(x+31,y+13,w-60,12,'#89cfca');rect(x+34,y+16,15,3,'#e8e3b7');
        rect(x+w/2-3,y+35,6,7,'#374554');rect(x+w/2-12,y+42,24,3,'#374554');
        rect(x+22,y+47,w-43,11,'#e8d6b5');rect(x+25,y+49,w-49,6,'#73828a');
        for(let i=0;i<8;i++)rect(x+28+i*6,y+50,3,2,'#d9e0d3');
        rect(x+w-18,y+43,8,13,'#e7dcc1');rect(x+8,y+8,10,13,'#f0dbc1');
        rect(x+5,y+h-12,17,10,'#67483c');rect(x+w-22,y+h-12,17,10,'#67483c');break;
      case 'shelf':
        rect(x,y,w,h,'#b99b79');stroke(x,y,w,h);rect(x+6,y+6,w-12,h-11,'#cfb89b');
        rect(x+5,y+30,w-10,6,'#f0d6ae');rect(x+5,y+58,w-10,6,'#f0d6ae');
        rect(x+5,y+83,w-10,6,'#f0d6ae');
        rect(x+6,y+7,5,h-13,'#f3d9ae');rect(x+w-11,y+7,5,h-13,'#f3d9ae');
        rect(x+13,y+41,8,16,'#7f9e9b');rect(x+23,y+39,8,18,'#d19878');
        rect(x+34,y+44,7,13,'#e8c778');
        rect(x+14,y+68,16,13,'#a8c1b4');rect(x+34,y+68,8,13,'#a78399');
        break;
    }
  }
  function drawCoffeeCup(x,y,body,light) {
    // Smaller than the collectible cat mug, with a little rising steam.
    rect(x-5,y-3,11,9,'#343440');
    rect(x-3,y-1,7,6,body);
    rect(x-2,y,2,4,light);
    rect(x+5,y-1,4,6,'#343440');
    rect(x+6,y+1,2,2,light);
    rect(x-3,y-4,7,2,'#65443d');
    const drift=Math.floor(state.time*2)%2;
    rect(x-2+drift,y-9,2,3,'#e5ddd0');
    rect(x-4+drift,y-13,2,3,'#c3c6bc');
    rect(x+3-drift,y-11,2,4,'#e5ddd0');
    rect(x+4-drift,y-15,2,2,'#c3c6bc');
  }
  function drawSock(px,py,variant,scale=1) {
    ctx.save();ctx.translate(Math.round(px),Math.round(py));ctx.scale(scale,scale);
    const colors={match:'#56b0b5',rose:'#d76d7a',violet:'#8e87b0'};
    const c=colors[variant];
    rect(-5,-10,11,15,palette.outline);rect(-3,-8,7,12,c);
    rect(-9,2,15,7,palette.outline);rect(-7,2,12,5,c);
    if(variant==='match') {rect(-3,-3,7,3,'#f3cd73');rect(-8,4,5,2,'#f3cd73');}
    ctx.restore();
  }
  function drawMug(px,py) {
    rect(px-8,py-5,17,14,palette.outline);rect(px-6,py-3,13,10,'#fff0d8');
    rect(px+8,py-2,6,7,palette.outline);rect(px+9,py,3,3,'#fff0d8');
    rect(px-3,py-1,2,2,'#5b4654');rect(px+3,py-1,2,2,'#5b4654');
    rect(px,py+3,2,1,'#d98a86');rect(px-4,py-4,3,3,'#dd9b92');rect(px+4,py-4,3,3,'#dd9b92');
  }
  function drawPlant(px,py) {
    rect(px-7,py+2,14,11,palette.outline);rect(px-5,py+3,10,8,'#d59578');rect(px-3,py-11,6,16,'#487960');
    rect(px-13,py-10,10,7,'#6eaa75');rect(px+4,py-14,9,8,'#70a973');
    rect(px-8,py-18,12,8,'#88b87d');rect(px-10,py-15,5,4,'#afcf8e');
    rect(px+7,py-10,4,3,'#b9d69c');
  }
  function drawItems() {
    for(const item of world.items) {
      if(state.collected.has(item.id)) continue;
      const px=item.x*T, py=item.y*T;
      if(item.kind==='sock') drawSock(px,py,item.variant);
      if(item.kind==='mug') drawMug(px,py);
      if(item.kind==='plant') drawPlant(px,py);
      const glint=Math.sin(state.time*4+px*.02);
      if(glint>.65) {rect(px+10,py-17,3,3,'#fff4c8');rect(px+11,py-20,1,9,'#fff4c8');rect(px+7,py-16,9,1,'#fff4c8');}
    }
  }
  function drawCat() {
    const x=Math.round(world.cat.x*T),y=Math.round(world.cat.y*T+Math.sin(state.time*2)*1.5);
    rect(x-13,y+8,27,5,'#20263388');
    rect(x+8,y-2,9,5,palette.outline);rect(x+13,y-8,5,8,'#747f88');
    rect(x-10,y-10,20,22,palette.outline);rect(x-8,y-8,16,17,'#87929a');
    rect(x-10,y-16,7,9,palette.outline);rect(x+3,y-16,7,9,palette.outline);
    rect(x-7,y-13,3,5,'#c893a1');rect(x+4,y-13,3,5,'#c893a1');
    rect(x-6,y+4,12,5,'#b7c1c5');
    rect(x-7,y-6,3,2,'#5f6b74');rect(x+4,y-6,3,2,'#5f6b74');
    rect(x-6,y-4,3,3,'#f3d982');rect(x+3,y-4,3,3,'#f3d982');
    rect(x-5,y-3,1,2,'#2e2a37');rect(x+4,y-3,1,2,'#2e2a37');
    rect(x-1,y+2,3,2,'#e3a0a0');
    rect(x-7,y+9,4,4,'#67737b');rect(x+3,y+9,4,4,'#67737b');
    if(performance.now()<state.catDisappointedUntil&&!state.collected.has('sock')) {
      const bubbleText='Я РАЗОЧАРОВАН В ТЕБЕ';
      const bubbleWidth=207;
      const bubbleX=x-Math.round(bubbleWidth/2),bubbleY=y-51;
      rect(bubbleX,bubbleY,bubbleWidth,23,'#192535');
      stroke(bubbleX,bubbleY,bubbleWidth,23,'#d9dfd5',2);
      rect(x-3,bubbleY+23,6,5,'#d9dfd5');
      ctx.fillStyle='#f3ead7';ctx.textAlign='center';ctx.font='bold 11px monospace';
      ctx.fillText(bubbleText,x,bubbleY+16);
      ctx.textAlign='left';
    }
    if(state.phase==='won') {ctx.fillStyle='#f4d47c';ctx.font='18px monospace';ctx.fillText('✦',x-3,y-24);}
  }
  function drawVacuum() {
    if(state.phase==='won'||state.phase==='final') return;
    const x=Math.round(world.vacuum.x*T),y=Math.round(world.vacuum.y*T+Math.sin(state.time*5)*1.1);
    rect(x-18,y+10,36,6,'#202633aa');rect(x-17,y-11,34,25,palette.outline);
    rect(x-14,y-8,28,18,'#e9ede9');rect(x-11,y-9,22,5,'#fff9e8');
    rect(x-9,y-1,5,5,'#232a39');rect(x+5,y-1,5,5,'#232a39');
    rect(x-7,y+7,15,2,'#83bfc1');rect(x-13,y+11,6,4,'#273344');rect(x+8,y+11,6,4,'#273344');
    rect(x-4,y-8,8,2,'#9cc9c6');
  }
  function drawPlayer() {
    const p=state.player,x=Math.round(p.x*T),y=Math.round(p.y*T);
    const walk=p.step?(Math.sin(p.step*11)>0?2:-2):0;
    rect(x-12,y+8,25,5,'#20263399');
    rect(x-8,y+4,6,7+walk,'#252b35');rect(x+2,y+4,6,7-walk,'#252b35');
    rect(x-9,y-8,18,15,palette.outline);rect(x-7,y-6,14,11,'#f5d63f');
    rect(x-5,y+2,10,3,'#d7aa30');
    rect(x-11,y-4,4,10,'#eab190');rect(x+8,y-4,4,10,'#eab190');
    rect(x-11,y-26,22,20,palette.outline);rect(x-9,y-24,18,17,'#edb68f');
    rect(x-10,y-31,20,7,'#382d2c');rect(x-7,y-34,15,4,'#4b3831');
    rect(x-3,y-36,8,3,'#594035');rect(x-11,y-28,5,11,'#382d2c');
    rect(x+8,y-28,4,9,'#382d2c');rect(x-8,y-25,7,3,'#382d2c');
    rect(x-2,y-28,9,3,'#382d2c');rect(x-4,y-32,8,2,'#69483a');
    if(p.dir!=='up') {
      rect(x-5,y-16,3,3,'#27303d');rect(x+4,y-16,3,3,'#27303d');
      rect(x-1,y-10,3,1,'#ab5d60');
    } else {
      rect(x-9,y-24,18,14,'#382d2c');
      rect(x-7,y-11,14,2,'#4b3831');
    }
    if(p.dir==='left'||p.dir==='right')rect(x+(p.dir==='left'?-9:7),y-15,3,3,'#27303d');
  }
  function drawWorld() {
    drawFloor();drawExit();
    for(const f of world.furniture) drawFurniture(f);
    drawItems();drawCat();drawVacuum();drawPlayer();
    for(const p of state.particles) rect(p.x,p.y,p.size,p.size,p.color);
  }
  function collision(x,y) {
    const r=.29;
    if(x-r<1 || y-r<1 || x+r>world.width-1 || y+r>world.height-1) return true;
    for(const p of world.partitions) {
      if(x+r>p.x && x-r<p.x+1 && !(y-r>=p.doorFrom && y+r<p.doorTo+1)) return true;
    }
    for(const f of world.furniture) {
      // Floor objects occupy their configured rectangles. The small margin makes movement forgiving.
      if(x+r>f.x+.08 && x-r<f.x+f.w-.08 && y+r>f.y+.08 && y-r<f.y+f.h-.08) return true;
    }
    return false;
  }
  function distanceToRect(x,y,f) {
    const dx=Math.max(f.x-x,0,x-(f.x+f.w));
    const dy=Math.max(f.y-y,0,y-(f.y+f.h));
    return Math.hypot(dx,dy);
  }
  function findNearest() {
    const p=state.player; let best=null;let bestD=Infinity;
    function offer(kind,data,d,max) { if(d<max && d<bestD) {best={kind,data};bestD=d;} }
    for(const item of world.items) if(!state.collected.has(item.id)) offer('item',item,Math.hypot(item.x-p.x,item.y-p.y),1.12);
    offer('cat',world.cat,Math.hypot(world.cat.x-p.x,world.cat.y-p.y),1.35);
    if(state.phase!=='won') offer('vacuum',world.vacuum,Math.hypot(world.vacuum.x-p.x,world.vacuum.y-p.y),1.35);
    offer('exit',world.exit,Math.hypot(world.exit.x-p.x,world.exit.y-p.y),1.4);
    offer('antlers',world.antlers,Math.hypot(world.antlers.x-p.x,world.antlers.y-p.y),1.15);
    if(!state.collected.has('sock')) {
      const couch=world.furniture.find(f=>f.type==='couch');
      offer('furniture',couch,distanceToRect(p.x,p.y,couch)+.22,.82);
    }
    // Quest objects and characters take precedence over nearby furniture.
    if(!best) for(const f of world.furniture) offer('furniture',f,distanceToRect(p.x,p.y,f)+.22,0.82);
    if(!best) for(const r of world.rugs) if(r.type==='sheepskin') offer('rug',r,distanceToRect(p.x,p.y,r),.7);
    return best;
  }
  function updatePrompt() {
    if(['battle','victory','cutscene','final','dead'].includes(state.phase)||state.secretOpen||!ui.dialogue.hidden){ui.prompt.hidden=true;return;}
    state.nearest=findNearest();
    ui.prompt.hidden=!state.nearest;
    if(state.nearest) {
      const {kind,data}=state.nearest;
      ui.prompt.style.left=`${Math.max(12,Math.min(88,state.player.x/world.width*100))}%`;
      ui.prompt.style.top=`${Math.max(12,Math.min(94,(state.player.y*T-29)/canvas.height*100))}%`;
      if(kind==='item') {
        const name=data.kind==='sock'&&data.id!=='sock'?'Носок?':cfg.itemNames[data.id];
        ui.promptLabel.textContent='Подобрать: '+name;
      } else ui.promptLabel.textContent=kind==='cat'?'Поговорить с котом':kind==='vacuum'?'Бросить вызов':kind==='exit'?'Осмотреть дверь':'Осмотреть';
    }
  }
  function playTone(freq=440,duration=.08,type='square',volume=.055) {
    if(!state.sound)return;
    try {
      if(!state.audio)state.audio=new (window.AudioContext||window.webkitAudioContext)();
      if(state.audio.state==='suspended')state.audio.resume();
      const osc=state.audio.createOscillator(),gain=state.audio.createGain();
      osc.type=type;osc.frequency.setValueAtTime(freq,state.audio.currentTime);
      gain.gain.setValueAtTime(volume,state.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001,state.audio.currentTime+duration);
      osc.connect(gain);gain.connect(state.audio.destination);osc.start();osc.stop(state.audio.currentTime+duration);
    } catch (_) { /* Browsers may decline audio until the first gesture. */ }
  }
  function musicForPhase() {
    return state.phase==='battle'?'battle':state.phase==='final'?(cfg.audio.finale?'finale':null):['victory','cutscene','dead'].includes(state.phase)?null:state.exploreIntroCompleted?'exploreLoop':'exploreIntro';
  }
  function syncMusic() {
    const wanted=state.victoryPlaying?null:musicForPhase();
    for(const [name,track] of Object.entries(state.music)) if(name!==wanted||!state.sound||!state.audioUnlocked)track.pause();
    state.activeMusic=wanted;
    if(!state.sound||!state.audioUnlocked||!cfg.audio[wanted])return;
    if(!state.music[wanted]) {
      const track=new Audio(cfg.audio[wanted]);
      track.loop=wanted!=='exploreIntro';track.preload='auto';
      if(wanted==='exploreIntro')track.addEventListener('ended',()=>{
        state.exploreIntroCompleted=true;
        syncMusic();
      });
      state.music[wanted]=track;
    }
    const track=state.music[wanted];
    track.volume=cfg.audio.musicVolume;
    if(track.paused)track.play().catch(()=>{});
  }
  function unlockAudio() {state.audioUnlocked=true;syncMusic();}
  function playCue(name) {
    if(!state.sound||!state.audioUnlocked||!cfg.audio[name])return;
    const clip=new Audio(cfg.audio[name]);
    clip.volume=cfg.audio.effectsVolume;
    clip.play().catch(()=>{});
  }
  function stopVictoryJingle() {
    if(state.victoryClip) {
      state.victoryClip.pause();
      state.victoryClip.currentTime=0;
      state.victoryClip=null;
    }
    state.victoryPlaying=false;
  }
  function playVictoryJingle() {
    stopVictoryJingle();
    if(!state.sound||!state.audioUnlocked||!cfg.audio.victory)return;
    const clip=new Audio(cfg.audio.victory);
    clip.volume=cfg.audio.effectsVolume;
    state.victoryClip=clip;
    state.victoryPlaying=true;
    clip.addEventListener('ended',()=>{
      if(state.victoryClip!==clip)return;
      state.victoryClip=null;
      state.victoryPlaying=false;
      syncMusic();
    });
    clip.play().catch(()=>{
      if(state.victoryClip!==clip)return;
      stopVictoryJingle();
      syncMusic();
    });
  }
  function fanfare() { [523,659,784,1046].forEach((n,i)=>later(()=>playTone(n,.18,'triangle',.09),i*130)); }
  function later(fn,delay) { const t=setTimeout(fn,delay);state.timers.push(t);return t; }
  function showDialogue(lines,done) {
    state.dialogueQueue=(Array.isArray(lines)?lines:[lines]).map(line=>typeof line==='string'?{speaker:'Мысли',text:line}:line);
    state.dialogueDone=done||null;
    ui.prompt.hidden=true;nextDialogue();
  }
  function nextDialogue() {
    if(!state.dialogueQueue.length) {
      ui.dialogue.hidden=true;
      const done=state.dialogueDone;state.dialogueDone=null;
      if(done)done();
      return;
    }
    const line=state.dialogueQueue.shift();
    ui.speaker.textContent=line.speaker||'Мысли';ui.text.textContent=line.text;
    ui.dialogue.hidden=false;playTone(630,.035,'triangle',.025);
  }
  function collect(item) {
    if(item.kind==='sock'&&item.id!=='sock') {
      const line=cfg.text.wrongSock[state.wrongSockSeen++%cfg.text.wrongSock.length];
      if(!state.collected.has('sock')&&++state.wrongSockStreak>=2)state.catDisappointedUntil=performance.now()+5000;
      showDialogue({speaker:'Мысли',text:line});playTone(210,.12);return;
    }
    state.wrongSockStreak=0;
    if(item.id==='sock')state.catDisappointedUntil=0;
    state.collected.add(item.id);
    const count=state.collected.size;renderQuests();
    burst(item.x*T,item.y*T,'#fff1a9',18);playTone(740,.1);later(()=>playTone(990,.16),110);
    const key=item.id==='sock'?'sockFound':item.id==='mug'?'mugFound':'snackFound';
    if(count===3) {
      showDialogue([{speaker:'Кот',text:cfg.text[key]},...cfg.text.allFound]);
    } else showDialogue({speaker:'Кот',text:cfg.text[key]});
  }
  function closeSecret() {
    state.secretOpen=false;ui.secret.hidden=true;updatePrompt();
  }
  function interact() {
    if(state.secretOpen)return;
    if(!ui.dialogue.hidden){nextDialogue();return;}
    if(['battle','victory','cutscene','final','dead'].includes(state.phase))return;
    const target=findNearest();if(!target)return;
    if(target.kind!=='cat'){state.catTalkStreak=0;state.catTalkText=null;}
    if(target.kind==='item'){collect(target.data);return;}
    if(target.kind==='exit') {showDialogue({speaker:'Мысли',text:cfg.text.exit});return;}
    if(target.kind==='rug') {showDialogue({speaker:'Мысли',text:cfg.text.sheepskin});return;}
    if(target.kind==='antlers') {showDialogue({speaker:'Мысли',text:cfg.text.antlers});return;}
    if(target.kind==='furniture'&&target.data.type==='fridge') {
      if(state.saladFound){showDialogue({speaker:'Мысли',text:cfg.text.furniture.fridge});return;}
      state.saladFound=true;state.secretOpen=true;ui.secret.hidden=false;ui.prompt.hidden=true;
      renderInventory();
      playTone(880,.14,'triangle',.08);return;
    }
    if(target.kind==='furniture'&&target.data.type==='couch'&&!state.collected.has('sock')) {
      showDialogue({speaker:'Мысли',text:cfg.text.couchBattle.found},()=>startBattle('couch'));return;
    }
    if(target.kind==='furniture') {showDialogue({speaker:'Мысли',text:cfg.text.furniture[target.data.type]||'Любопытная вещь.'});return;}
    if(target.kind==='vacuum') {
      if(state.collected.size===3)startBattle('vacuum');
      else showDialogue({speaker:'Мысли',text:cfg.text.vacuumBefore});
      return;
    }
    if(target.kind==='cat') {
      const catText=state.collected.size===3?cfg.text.catReady:cfg.text.catBefore;
      if(catText!==state.catTalkText){state.catTalkText=catText;state.catTalkStreak=0;}
      if(state.phase!=='won'&&++state.catTalkStreak===3) {
        state.catEasterSeen=true;state.catTalkStreak=0;
        showDialogue({speaker:'Кот',text:cfg.text.catEaster});return;
      }
      if(state.phase==='won')showDialogue(cfg.text.afterBattle,showFinale);
      else showDialogue({speaker:'Кот',text:catText});
    }
  }
  function burst(x,y,color,count=12) {
    for(let i=0;i<count;i++) {
      const a=i/count*Math.PI*2, speed=26+Math.random()*35;
      state.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-24,life:.5+Math.random()*.4,size:2+Math.random()*3,color});
    }
  }
  function startBattle(kind='vacuum') {
    stopVictoryJingle();
    state.battleKind=kind;state.phase='battle';state.battle={hp:3,bossHp:kind==='couch'?3:5,attacks:0,shield:false,busy:false,saladUsed:false};
    state.exploreIntroCompleted=true;
    renderQuests();renderInventory();
    ui.overlay.hidden=false;ui.battle.hidden=false;ui.cutscene.hidden=true;ui.finale.hidden=true;ui.death.hidden=true;ui.prompt.hidden=true;
    ui.battleHeading.textContent=kind==='couch'?'◆ БИТВА С ДИВАНОМ':'◆ ИСПЫТАНИЕ';
    ui.enemyName.textContent=kind==='couch'?'ДИВАН':'РОБОТ-ПЫЛЕСОС';
    ui.battleEnemy.className='battle-sprite '+(kind==='couch'?'battle-couch':'battle-vacuum');
    ui.battleHero.classList.remove('shake');
    state.battleFxSeq++;ui.battleFx.textContent='';ui.battleFx.classList.remove('pop');
    ui.salad.hidden=kind==='couch'||!state.saladFound;
    ui.battleLog.textContent=(kind==='couch'?cfg.text.couchBattle:cfg.text.battle).opening;ui.battleTurn.textContent='ХОД ГЕРОЯ';
    updateBattle();syncMusic();playTone(160,.3,'sawtooth',.07);
  }
  function updateBattle() {
    const b=state.battle;
    ui.heroHearts.textContent='♥ '.repeat(b.hp)+'♡ '.repeat(3-b.hp);
    const total=state.battleKind==='couch'?3:5;
    ui.bossHearts.textContent='♥ '.repeat(b.bossHp)+'♡ '.repeat(total-b.bossHp);
    ui.attack.disabled=b.busy;ui.defend.disabled=b.busy;ui.super.disabled=b.busy||b.attacks<1;ui.salad.disabled=b.busy||b.saladUsed;
  }
  function battleEffect(target,symbol) {
    const el=target==='boss'?ui.battleEnemy:ui.battleHero;
    el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake');
    ui.battleFx.style.left=target==='boss'?'70%':'25%';
    ui.battleFx.textContent=symbol;ui.battleFx.classList.remove('pop');void ui.battleFx.offsetWidth;ui.battleFx.classList.add('pop');
    const effectSeq=++state.battleFxSeq;
    later(()=>{if(effectSeq===state.battleFxSeq){ui.battleFx.textContent='';ui.battleFx.classList.remove('pop');}},600);
    if(target==='hero')playTone(115,.18,'sawtooth',.08);
  }
  function battleAction(action) {
    const b=state.battle;if(state.phase!=='battle'||b.busy)return;
    const lines=state.battleKind==='couch'?cfg.text.couchBattle:cfg.text.battle;
    if(action==='super'&&b.attacks<1)return;
    if(action==='salad'&&(state.battleKind!=='vacuum'||!state.saladFound||b.saladUsed))return;
    b.busy=true;ui.battleTurn.textContent='ХОД ГЕРОЯ';
    if(action==='salad') {
      const damage=Math.min(3,b.bossHp);b.bossHp-=damage;b.saladUsed=true;
      renderInventory();
      ui.battleLog.textContent=damage===3&&b.bossHp>0?cfg.text.battle.salad:`ТЫ БРОСИЛ ОЛИВЬЕ! Пылесос теряет ${damage} HP и сдаётся!`;
      battleEffect('boss',`-${damage}`);playTone(630,.25,'square',.08);
    }
    if(action==='attack') {b.bossHp=Math.max(0,b.bossHp-1);b.attacks++;ui.battleLog.textContent=lines.attack;battleEffect('boss','-1');playCue('attack');}
    if(action==='super') {
      const damage=Math.min(2,b.bossHp);b.bossHp-=damage;
      ui.battleLog.textContent=damage===2?lines.super:`СУПЕР-АТАКА! Последнее сердечко потеряно!`;
      battleEffect('boss',`-${damage}`);playCue('attack');
    }
    if(action==='defend') {b.shield=true;ui.battleLog.textContent=cfg.text.battle.defend;playCue('guard');}
    updateBattle();
    if(b.bossHp<=0) {later(winBattle,1150);return;}
    later(() => {
      ui.battleTurn.textContent=state.battleKind==='couch'?'ХОД ДИВАНА':'ХОД ПЫЛЕСОСА';
      if(b.shield) {ui.battleLog.textContent=lines.bossBlocked;b.shield=false;playTone(380,.15);}
      else {b.hp=Math.max(0,b.hp-1);ui.battleLog.textContent=lines.bossHit;battleEffect('hero','-1');}
      updateBattle();
      if(b.hp<=0) {
        later(loseBattle,700);
      } else later(()=>{b.busy=false;ui.battleTurn.textContent='ХОД ГЕРОЯ';updateBattle();},1100);
    },1100);
  }
  function loseBattle() {
    state.phase='dead';ui.battle.hidden=true;ui.death.hidden=false;ui.prompt.hidden=true;
    ui.deathText.textContent=state.battleKind==='couch'?cfg.text.couchBattle.lose:'Пылесос победил. Кот утверждает, что это была репетиция.';
    renderQuests();syncMusic();
  }
  function winBattle() {
    ui.battleLog.textContent=state.battleKind==='couch'?cfg.text.couchBattle.win:cfg.text.battle.win;ui.battleTurn.textContent='ПОБЕДА!';
    state.phase='victory';
    for(const track of Object.values(state.music))track.pause();
    if(state.battleKind==='vacuum'){showCutscene();return;}
    playVictoryJingle();syncMusic();
    later(()=>{
      const couch=world.furniture.find(f=>f.type==='couch');
      state.phase='explore';ui.overlay.hidden=true;ui.battle.hidden=true;renderQuests();
      collect({id:'sock',kind:'sock',x:couch.x+couch.w/2,y:couch.y});
      syncMusic();
    },1800);
  }
  function showCutscene() {
    state.phase='cutscene';state.cutsceneVoiceStarted=false;
    ui.overlay.hidden=false;ui.battle.hidden=true;ui.cutscene.hidden=false;ui.prompt.hidden=true;
    renderQuests();syncMusic();maybeStartCutsceneVoice();
  }
  function maybeStartCutsceneVoice() {
    if(state.phase!=='cutscene'||state.victoryPlaying||state.cutsceneVoiceStarted)return;
    state.cutsceneVoiceStarted=true;
    if(!cfg.audio.rooftopVoice||!state.sound||!state.audioUnlocked) {later(finishCutscene,3500);return;}
    const clip=new Audio(cfg.audio.rooftopVoice);
    state.cutsceneVoice=clip;clip.volume=cfg.audio.voiceVolume;clip.preload='auto';
    let failed=false;
    const fallback=()=>{if(failed)return;failed=true;later(finishCutscene,3500);};
    clip.addEventListener('ended',()=>{if(state.cutsceneVoice===clip)finishCutscene();},{once:true});
    clip.addEventListener('error',fallback,{once:true});
    clip.play().catch(fallback);
  }
  function finishCutscene() {
    if(state.phase!=='cutscene')return;
    if(state.cutsceneVoice) {state.cutsceneVoice.pause();state.cutsceneVoice.currentTime=0;state.cutsceneVoice=null;}
    state.cutsceneVoiceStarted=false;
    state.phase='won';ui.overlay.hidden=true;ui.cutscene.hidden=true;renderQuests();
    burst(world.vacuum.x*T,world.vacuum.y*T,'#f9d37f',30);
    syncMusic();showDialogue({speaker:'Кот',text:cfg.text.returnToCat});
  }
  function showFinale() {
    state.phase='final';ui.overlay.hidden=false;ui.battle.hidden=true;ui.finale.hidden=false;ui.prompt.hidden=true;
    ui.finalTitle.textContent=cfg.text.finaleTitle;ui.finalSubtitle.textContent=cfg.text.finaleSubtitle;
    renderQuests();syncMusic();
  }
  function restart() {
    state.timers.forEach(clearTimeout);state.timers=[];
    stopVictoryJingle();
    if(state.cutsceneVoice) {state.cutsceneVoice.pause();state.cutsceneVoice.currentTime=0;state.cutsceneVoice=null;}
    state.cutsceneVoiceStarted=false;
    for(const track of Object.values(state.music)) {track.pause();track.currentTime=0;}
    state.exploreIntroCompleted=false;
    state.phase='explore';state.player={x:world.start.x,y:world.start.y,dir:'down',step:0};state.collected.clear();state.introQuestsUnlocked=false;
    state.wrongSockSeen=0;state.wrongSockStreak=0;state.catDisappointedUntil=0;
    state.catTalkStreak=0;state.catTalkText=null;state.catEasterSeen=false;
    state.saladFound=false;state.secretOpen=false;
    state.battleKind='vacuum';state.battle={hp:3,bossHp:5,attacks:0,shield:false,busy:false,saladUsed:false};
    state.keys.clear();state.particles=[];state.dialogueQueue=[];state.dialogueDone=null;
    ui.overlay.hidden=true;ui.battle.hidden=true;ui.cutscene.hidden=true;ui.finale.hidden=true;ui.death.hidden=true;ui.secret.hidden=true;renderQuests();renderInventory();
    syncMusic();
    showDialogue(cfg.text.intro,()=>{state.introQuestsUnlocked=true;renderQuests();});
  }
  function tick(dt) {
    state.time+=dt;
    if(state.phase==='explore'||state.phase==='won') {
      if(ui.dialogue.hidden&&!state.secretOpen) {
        const k=state.keys;
        let dx=Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft'));
        let dy=Number(k.has('s')||k.has('arrowdown'))-Number(k.has('w')||k.has('arrowup'));
        if(dx||dy) {
          const len=Math.hypot(dx,dy);dx/=len;dy/=len;
          const speed=3.0*dt,p=state.player;
          if(!collision(p.x+dx*speed,p.y))p.x+=dx*speed;
          if(!collision(p.x,p.y+dy*speed))p.y+=dy*speed;
          p.dir=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';p.step+=dt*5;
        } else state.player.step=0;
      }
      updatePrompt();
    }
    state.particles=state.particles.filter(p=>p.life>0);
    for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=130*dt;p.life-=dt;}
    drawWorld();
  }
  let last=performance.now();
  function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;tick(dt);requestAnimationFrame(frame);}
  const movement=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
  document.addEventListener('keydown',e=>{
    unlockAudio();
    const key=e.key.toLowerCase();
    if(movement.has(key)||key===' '||key==='enter'||key==='e')e.preventDefault();
    if(state.secretOpen) {if(key==='e'||key===' '||key==='enter'||key==='escape')closeSecret();return;}
    if(state.phase==='cutscene') {if(key==='e'||key===' '||key==='enter'||key==='escape')finishCutscene();return;}
    if(state.phase==='dead') {if(key==='enter'||key==='e'||key===' ')startBattle(state.battleKind);return;}
    if(movement.has(key))state.keys.add(key);
    if(e.repeat)return;
    if(key==='e'||key===' '){if(state.phase==='battle'||state.phase==='victory'||state.phase==='final')return;interact();}
    if(key==='enter'&&!ui.dialogue.hidden)nextDialogue();
  });
  document.addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));
  document.addEventListener('pointerdown',unlockAudio);
  document.addEventListener('click',unlockAudio);
  window.addEventListener('blur',()=>state.keys.clear());
  ui.next.addEventListener('click',nextDialogue);
  ui.attack.addEventListener('click',()=>battleAction('attack'));
  ui.defend.addEventListener('click',()=>battleAction('defend'));
  ui.super.addEventListener('click',()=>battleAction('super'));
  ui.salad.addEventListener('click',()=>battleAction('salad'));
  $('retryButton').addEventListener('click',()=>startBattle(state.battleKind));
  $('secretClose').addEventListener('click',closeSecret);
  $('cutsceneSkip').addEventListener('click',finishCutscene);
  $('restartButton').addEventListener('click',restart);
  $('soundToggle').querySelector('button').addEventListener('click',e=>{
    state.sound=!state.sound;e.currentTarget.textContent=state.sound?'♫ ЗВУК ВКЛ':'♫ ЗВУК ВЫКЛ';
    e.currentTarget.setAttribute('aria-pressed',String(state.sound));
    if(!state.sound)stopVictoryJingle();
    if(state.cutsceneVoice)state.cutsceneVoice.muted=!state.sound;
    syncMusic();
    maybeStartCutsceneVoice();
    if(state.sound)playTone(630,.08);
  });
  for(const button of document.querySelectorAll('[data-dir]')){
    const key={up:'w',left:'a',down:'s',right:'d'}[button.dataset.dir];
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);state.keys.add(key);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>state.keys.delete(key));
  }
  $('touchAction').addEventListener('click',()=>{if(!ui.dialogue.hidden)nextDialogue();else interact();});
  restart();unlockAudio();requestAnimationFrame(frame);
  // Read-only progress is useful when checking a local build in a browser.
  window.gameProgress=()=>({phase:state.phase,battleKind:state.battleKind,collected:[...state.collected],player:{...state.player},heroHp:state.battle.hp,bossHp:state.battle.bossHp,saladUsed:state.battle.saladUsed,music:state.activeMusic,victoryPlaying:state.victoryPlaying,cutsceneVoicePlaying:!!state.cutsceneVoice&&!state.cutsceneVoice.paused,finaleLooping:state.music.finale?.loop===true,saladFound:state.saladFound,catDisappointed:performance.now()<state.catDisappointedUntil,catEasterSeen:state.catEasterSeen});
  if(new URLSearchParams(location.search).has('smoke')) {
    window.gameTestTick=tick;
    window.gameTestFinishIntro=()=>{state.exploreIntroCompleted=true;syncMusic();};
    window.gameTestPlacePlayer=(x,y)=>{state.player.x=x;state.player.y=y;updatePrompt();};
    window.gameTestUnlockQuests=()=>{for(const id of ['sock','mug','snack'])state.collected.add(id);renderQuests();};
    window.gameTestFinishCutsceneVoice=()=>state.cutsceneVoice?.dispatchEvent(new Event('ended'));
  }
})();
