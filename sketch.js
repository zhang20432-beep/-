let capture;
let pg;
let handPose;
let hands = [];
let palmCenter = { x: 0, y: 0 }; // 用於儲存手掌中心座標
let fallingBlock; // 當前掉落的俄羅斯方塊
let stackedBlocks = []; // 儲存已堆疊且固定的方塊
let lastMoveTime = 0; // 上次手勢移動的時間（用於冷卻）
let score = 0; // 新增：儲存消除行數的分數
let highScore = 0; // 新增：儲存最高分紀錄
let isGameOver = false; // 遊戲結束狀態
let isGameStarted = false; // 新增：遊戲開始狀態
let isTutorialMode = false; // 新增：教學模式狀態
let stars = []; // 用於儲存背景星星數據

// 動態消除相關變數
let isAnimatingClear = false;
let clearingRows = [];
let clearingStartTime = 0;
const CLEAR_ANIM_DURATION = 600; // 閃爍持續時間 (毫秒)

// 處理消除動畫的計時與最終移除
function handleClearAnimation() {
  if (!isAnimatingClear) return;

  // 如果動畫時間結束
  if (millis() - clearingStartTime > CLEAR_ANIM_DURATION) {
    // 1. 更新分數
    score += clearingRows.length * 100;

    // 2. 真正從陣列中移除方塊
    stackedBlocks = stackedBlocks.filter(b => !clearingRows.includes(Math.round(b.y)));

    // 3. 讓上方的方塊往下掉
    for (let b of stackedBlocks) {
      let rowsClearedBelow = clearingRows.filter(ry => ry > Math.round(b.y)).length;
      b.y += rowsClearedBelow * 40; // 40 為 unitSize
    }

    // 4. 結束動畫狀態
    isAnimatingClear = false;
    clearingRows = [];
  }
}

// 初始化星星
function initStars() {
  stars = [];
  for (let i = 0; i < 400; i++) {
    stars.push({
      x: random(width),
      y: random(height),
      size: random(1, 3),
      phase: random(TWO_PI) // 隨機相位讓閃爍錯開
    });
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  initStars();
  capture = createCapture(VIDEO);
  capture.hide();

  // 初始化手部偵測模型
  handPose = ml5.handPose({ flipped: true }, () => {
    console.log("HandPose Model Ready!");
    // 確保 capture 已經準備好再開始偵測
      // 從 localStorage 載入最高分，如果沒有則預設為 0
      let storedHighScore = localStorage.getItem('tetrisHighScore');
      if (storedHighScore) highScore = parseInt(storedHighScore);
    handPose.detectStart(capture.elt, gotHands);
  });
}

function draw() {
  background(0); 
  
  // 1. 繪製閃爍星空背景
  noStroke();
  for (let s of stars) {
    // 利用 sin 函數隨時間改變透明度，達到閃爍效果
    let alpha = map(sin(frameCount * 0.05 + s.phase), -1, 1, 50, 255);
    fill(255, alpha);
    ellipse(s.x, s.y, s.size);
  }

  // 在影像畫面外顯示分數 (畫布左上角背景區域)
  push();
  fill(255); // 改用白色，確保在黑色背景下清晰可見
  textSize(24);
  textAlign(LEFT, TOP);
  text("Score: " + score, 20, 20); // 分數顯示在 y=20
  text("High Score: " + highScore, 20, 70); // 最高分顯示在 y=70，增加間距
  pop();

  // 確保遊戲區域寬高為 40 的倍數（一格的大小），並置於中央
  let w = Math.floor(width * 0.6 / 40) * 40;
  let h = Math.floor(height * 0.6 / 40) * 40;
  let x = Math.floor((width - w) / 2);
  let y = Math.floor((height - h) / 2);

  // 在影像辨識視窗上方顯示學號姓名
  push();
  fill(255);
  textSize(20);
  textAlign(CENTER, BOTTOM);
  text("414730514 張芷瑄", x + w / 2, y - 10);
  pop();

  // 2. 繪製科技感發光外框 (在鏡像轉換前繪製)
  push();
  noFill();
  for (let i = 1; i <= 8; i++) {
    stroke(0, 255, 255, 180 / (i * 1.5)); // 青色 (Cyan) 漸淡透明度
    strokeWeight(i * 2.5); // 線條逐層變粗
    rect(x, y, w, h, 5); // 稍微帶一點圓角增加設計感
  }
  stroke(255); // 最核心的一圈白線
  strokeWeight(2);
  rect(x, y, w, h, 5);
  pop();

  // 當攝影機尺寸載入後，初始化一個寬高一致的 graphics 物件
  if (!pg && capture.width > 0) {
    pg = createGraphics(capture.width, capture.height);
  }

  push();
  translate(width, 0); // 水平翻轉，修正鏡像問題
  scale(-1, 1);

  // 1. 繪製攝影機影像
  image(capture, x, y, w, h);

  // 2. 顯示 graphics 內容在視訊上方
  if (pg) {
    image(pg, x, y, w, h);
  }

  // 3. 執行手部偵測繪製（這會更新 palmCenter 的值）
  drawHands(x, y, w, h);

  // 偵測回饋與除錯儀表板
  push();
  scale(-1, 1); // 抵消整體的鏡像，讓文字正向顯示
  fill(255, 255, 0); // 使用鮮黃色文字，在視訊畫面上較清晰
  textSize(24);
  textAlign(RIGHT, TOP); // 改為靠右對齊

  let gData = { code: 0, count: 0, states: [false, false, false, false, false] };
  if (hands.length > 0) {
    gData = getGesture(hands[0]);
  }

  // 1. 顯示手勢判定與手指數量
  let gestureName = gData.code === 1 ? "OPEN_HAND (Right)" : gData.code === 2 ? "FIST (Left)" : "None";
  text("Gesture: " + gestureName, -20, 20); // 移至右側並上移，與左側分數對齊
  text("Fingers Count: " + gData.count, -20, 50); 

  // 2. 顯示每根手指的詳細狀態 (除錯資訊)
  textSize(16);
  let fingerNames = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
  for (let i = 0; i < 5; i++) {
    let s = gData.states[i];
    fill(s ? color(0, 255, 0) : color(255, 100, 100)); // 伸直為綠，彎曲為紅
    text(fingerNames[i] + ": " + (s ? "伸直 (EXT)" : "彎曲 (CURL)"), -20, 80 + i * 20);
  }
  pop();

  if (!isGameStarted) {
    pop(); // 先結束鏡像轉換，讓 UI 座標恢復正常
    if (!isTutorialMode) {
      displayWelcomeScreen(x, y, w, h);
    } else {
      displayTutorialScreen(x, y, w, h);
    }
    return; // 尚未開始遊戲時停止後續邏輯
  }

  if (isGameOver) {
    pop(); // 先結束鏡像轉換，讓 UI 座標恢復正常
    displayGameOver(x, y, w, h);
    return; // 遊戲結束時停止後續邏輯
  }

  // 4. 俄羅斯方塊邏輯
  handleClearAnimation(); // 處理消除動畫計時與邏輯更新

  // 繪製所有已固定的小方格 (Cells)
  push();
  rectMode(CORNER);
  for (let cell of stackedBlocks) {
    // 檢查此方格是否位於正在消除的行
    let isThisRowClearing = isAnimatingClear && clearingRows.includes(Math.round(cell.y));
    
    if (isThisRowClearing) {
      // 閃爍效果：利用 millis() 讓方塊在白色與原色間切換
      if (Math.floor(millis() / 100) % 2 === 0) {
        fill(255); // 閃爍白光
      } else {
        fill(cell.color);
      }
    } else {
      fill(cell.color);
    }
    rect(cell.x, cell.y, 40, 40); // unitSize 為 40
  }
  pop();

  // 如果目前沒有正在掉落的方塊，且「沒有」正在進行消除動畫，就生成一個新的
  if (!fallingBlock && !isAnimatingClear) {
    fallingBlock = new FallingBlock(x, x + w, y, y + h);
  }

  if (fallingBlock) {
    // 取得手勢並處理冷卻時間
    let moveDirection = 0;
    if (hands.length > 0) {
      let gData = getGesture(hands[0]);
      let gesture = gData.code;
      // 如果偵測到有效手勢且距離上次移動超過 400 毫秒
      if (gesture !== 0 && millis() - lastMoveTime > 400) {
        moveDirection = gesture;
        
        // 在終端機顯示偵測結果
        if (gesture === 1) console.log("Detected: OPEN_HAND → Move Right");
        if (gesture === 2) console.log("Detected: FIST → Move Left");
        
        lastMoveTime = millis(); // 更新最後移動時間
      }
    }

    fallingBlock.update(moveDirection);
    fallingBlock.display();

    // 當方塊固定後，將其移入已固定陣列，並清空當前變數以觸發下一次生成
    if (fallingBlock.isFixed) {
      // 分解成獨立的小方格並對齊 40 像素網格
      let snappedX = Math.round((fallingBlock.x - x) / 40) * 40 + x;
      let snappedY = Math.round((fallingBlock.y - y) / 40) * 40 + y;

      for (let p of fallingBlock.shape) {
        stackedBlocks.push({
          x: snappedX + p[0] * 40,
          y: snappedY + p[1] * 40,
          color: fallingBlock.color
        });
      }
      fallingBlock = null;
      // 執行消除滿行判斷
      clearLines(x, w);

      // 檢查遊戲結束：如果有任何固定方塊的高度到達或超過頂部 y 座標
      for (let cell of stackedBlocks) {
        if (Math.round(cell.y) <= y) {
          isGameOver = true;
          break;
        }
      }
    }
  }

  pop();
}

function displayGameOver(x, y, w, h) {
  push();
  fill(0, 0, 0, 150); // 半透明背景
  rect(x, y, w, h);
  fill(255, 0, 0);
  textAlign(CENTER, CENTER);
  textSize(60);
  text("GAME OVER", x + w / 2, y + h / 2 - 50);

  // 顯示最終分數和最高分
  fill(255);
  textSize(30);
  text("Your Score: " + score + "\nHigh Score: " + highScore, x + w / 2, y + h / 2 + 20);

  // 繪製「再玩一次」按鈕視覺
  let btnW = 200;
  let btnH = 60;
  let btnX = x + w / 2 - btnW / 2;
  let btnY = y + h / 2 + 80; // 同步改為 +80，與 mousePressed 的判定一致

  fill(255);
  stroke(0);
  rect(btnX, btnY, btnW, btnH, 10); // 圓角按鈕
  
  fill(0);
  noStroke();
  textSize(24);
  text("Play Again", x + w / 2, btnY + btnH / 2);
  pop();
}

function displayTutorialScreen(x, y, w, h) {
  push();
  fill(0, 0, 0, 200); // 稍微深一點的背景
  rect(x, y, w, h);
  fill(255);
  textAlign(CENTER, CENTER);
  
  textSize(40);
  text("手勢操作教學", x + w / 2, y + h / 2 - 120);
  
  let textX = x + w / 2 - 80;
  textAlign(LEFT, CENTER);
  
  // 手勢 1: 向右
  textSize(30);
  text("🖐️", textX - 50, y + h / 2 - 50);
  textSize(22);
  text("五指張開：向右移動", textX, y + h / 2 - 50);
  
  // 手勢 2: 向左
  textSize(30);
  text("✊", textX - 50, y + h / 2 + 10);
  textSize(22);
  text("緊握拳頭：向左移動", textX, y + h / 2 + 10);

  // 提示文字
  textAlign(CENTER, CENTER);
  fill(200);
  textSize(16);
  text("提示：請確保手掌在視訊框中心位置", x + w / 2, y + h / 2 + 60);

  // 繪製按鈕
  let btnY = y + h / 2 + 100;
  fill(0, 150, 255); // 教學畫面使用藍色按鈕區分
  stroke(255);
  rect(x + w/2 - 100, btnY, 200, 60, 10);
  fill(255);
  noStroke();
  textSize(24);
  text("我準備好了！", x + w / 2, btnY + 30);
  pop();
}

function displayWelcomeScreen(x, y, w, h) {
  push();
  fill(0, 0, 0, 150); // 半透明背景
  rect(x, y, w, h);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(50);
  text("俄羅斯方塊指揮家", x + w / 2, y + h / 2 - 100);

  // 繪製裝飾性俄羅斯方塊 (T型)
  let s = 25; // 小方格尺寸
  let tx = x + w / 2;
  let ty = y + h / 2 - 10; // 方塊的中心點
  push();
  translate(tx, ty); // 將座標原點移到方塊中心
  rotate(frameCount * 0.01); // 緩慢旋轉，0.01 是旋轉速度
  stroke(255);
  strokeWeight(2);
  fill(180, 0, 255); // 紫色
  rect(-s / 2, -s / 2, s, s);     // 中心
  rect(-s * 1.5, -s / 2, s, s);   // 左
  rect(s / 2, -s / 2, s, s);     // 右
  rect(-s / 2, s / 2, s, s);     // 下
  pop();

  // 繪製「開始遊戲」按鈕視覺
  let btnW = 200;
  let btnH = 60;
  let btnX = x + w / 2 - btnW / 2;
  let btnY = y + h / 2 + 80; // 下移以避開裝飾方塊

  fill(0, 200, 0); // 綠色按鈕代表開始
  stroke(255);
  strokeWeight(2);
  rect(btnX, btnY, btnW, btnH, 10); 

  fill(255);
  noStroke();
  textSize(24);
  text("Start Game", x + w / 2, btnY + btnH / 2);
  pop();
}

function gotHands(results) {
  hands = results;
}

function drawHands(offsetX, offsetY, displayW, displayH) {
  // 如果有偵測到手，我們優先取第一隻手 (hands[0]) 來控制方塊
  if (hands.length > 0) {
    let hand = hands[0];
    
    // 1. 計算手掌中心 (取手腕與四指基部的平均值)
    let k = hand.keypoints;
    let cx = (k[0].x + k[5].x + k[9].x + k[13].x + k[17].x) / 5;
    let cy = (k[0].y + k[5].y + k[9].y + k[13].y + k[17].y) / 5;

    // 2. 將原始座標映射到畫布顯示區域
    // 這裡我們把計算好的中心點存入全域變數，方便之後控制遊戲物件
    palmCenter.x = offsetX + map(cx, 0, capture.width, 0, displayW);
    palmCenter.y = offsetY + map(cy, 0, capture.height, 0, displayH);

    // 3. 繪製中心點 (紅色大圓) 方便視覺化確認
    fill(255, 0, 0);
    noStroke();
    circle(palmCenter.x, palmCenter.y, 20);

    // 繪製其餘 21 個關鍵點
    for (let j = 0; j < hand.keypoints.length; j++) {
      let keypoint = hand.keypoints[j];
      // 將攝影機原始座標對應到畫布上顯示的區域
      let px = map(keypoint.x, 0, capture.width, 0, displayW);
      let py = map(keypoint.y, 0, capture.height, 0, displayH);
      
      fill(0, 255, 0);
      noStroke();
      circle(offsetX + px, offsetY + py, 10);
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  initStars(); // 視窗縮放時重新分布星星
}

// 手勢判斷邏輯
function getGesture(hand) {
  let k = hand.keypoints;
  // 使用距離比例判斷手指是否伸直（不受手掌傾斜或鏡像翻轉影響）
  // 判斷指尖（Point 8, 12, 16, 20）到手腕（Point 0）的距離
  // 是否明顯大於指根（Point 5, 9, 13, 17）到手腕的距離
  function isExtended(tipIdx, baseIdx) {
    let dTip = dist(k[tipIdx].x, k[tipIdx].y, k[0].x, k[0].y);
    let dBase = dist(k[baseIdx].x, k[baseIdx].y, k[0].x, k[0].y);
    return dTip > dBase * 1.1; // 將 1.2 調降至 1.1，增加靈敏度
  }

  // 大拇指判定：指尖(4)與手腕(0)的距離 vs 指根關節(2)與手腕的距離
  let thumbUp = dist(k[4].x, k[4].y, k[0].x, k[0].y) > dist(k[2].x, k[2].y, k[0].x, k[0].y) * 1.15;
  let indexUp = isExtended(8, 5);
  let middleUp = isExtended(12, 9);
  let ringUp = isExtended(16, 13);
  let pinkyUp = isExtended(20, 17);

  let states = [thumbUp, indexUp, middleUp, ringUp, pinkyUp];
  // 計算有多少根手指是伸直的
  let extendedCount = states.filter(v => v).length;

  let code = 0;
  // 五根全開 (或大於等於 4 根，增加容錯率) -> 往右
  if (extendedCount >= 4) code = 1;
  // 手勢 2: 握拳 (伸直手指為 0) -> 往左
  else if (extendedCount <= 1 && !indexUp) code = 2; // 只要食指沒伸直且伸直數極少就判定為握拳
  
  return { code: code, count: extendedCount, states: states };
}

function mousePressed() {
    // 重新計算按鈕在螢幕上的實際範圍（通用座標）
    let w = Math.floor(width * 0.6 / 40) * 40;
    let h = Math.floor(height * 0.6 / 40) * 40;
    let x = Math.floor((width - w) / 2);
    let y = Math.floor((height - h) / 2);
    
    let btnW = 200;
    let btnH = 60;
    let btnX = x + w / 2 - btnW / 2;

  // 如果尚未開始遊戲，檢查是否點擊「開始遊戲」
  if (!isGameStarted) {
    // 根據目前是否在教學模式，調整判定的按鈕高度
    let currentBtnY = !isTutorialMode ? y + h / 2 + 80 : y + h / 2 + 100;

    if (mouseX > btnX && mouseX < btnX + btnW && mouseY > currentBtnY && mouseY < currentBtnY + btnH) {
      if (!isTutorialMode) {
        isTutorialMode = true; // 第一步：進入教學畫面
      } else {
        isGameStarted = true;  // 第二步：正式開始遊戲
      }
    }
    return;
  }

  let btnY = y + h / 2 + 80; // 遊戲結束按鈕的高度
  if (isGameOver) {
    // 檢查是否打破最高分紀錄
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('tetrisHighScore', highScore); // 儲存新的最高分
    }

    // 判斷滑鼠點擊位置是否在按鈕矩形內
    if (mouseX > btnX && mouseX < btnX + btnW && mouseY > btnY && mouseY < btnY + btnH) {
      // 重新開始遊戲，重設所有關鍵變數
      stackedBlocks = [];
      score = 0;
      isGameOver = false;
      fallingBlock = null;
      isAnimatingClear = false;
      clearingRows = [];
    }
  }
}

// 俄羅斯方塊類別
class FallingBlock {
  constructor(minX, maxX, minY, maxY) {
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
    this.unitSize = 40; // 每個小格子的尺寸
    this.isFixed = false; // 是否已固定
    
    // 隨機選取經典形狀
    const shapes = [
      [[0,0], [1,0], [0,1], [1,1]], // O型
      [[0,0], [-1,0], [1,0], [2,0]], // I型
      [[0,0], [-1,0], [1,0], [0,1]], // T型
      [[0,0], [1,0], [0,1], [-1,1]], // S型
      [[0,0], [-1,0], [0,1], [1,1]]  // Z型
    ];
    
    this.shape = random(shapes);
    this.color = color(random(100, 255), random(100, 255), random(100, 255));
    
    // 計算形狀相對於中心點的最小與最大偏移，用於精確的邊界限制
    this.minOffsetX = Math.min(...this.shape.map(p => p[0]));
    this.maxOffsetX = Math.max(...this.shape.map(p => p[0]));
    this.maxOffsetY = Math.max(...this.shape.map(p => p[1]));

    // 起始位置對齊網格中心
    let midX = (minX + maxX) / 2;
    this.x = Math.round((midX - minX) / this.unitSize) * this.unitSize + minX;
    this.y = minY; // 從影像頂部開始
    this.fallInterval = 500; // 每 0.5 秒掉落一格
    this.lastFallTime = millis();
  }

  update(moveDirection) {
    if (this.isFixed) return;

    // 1. 處理水平移動 (由手勢觸發的一格位移)
    if (moveDirection !== 0) {
      let nextX = this.x;
      // 因為畫面經過 scale(-1, 1) 鏡像翻轉，X 的增減方向與視覺相反
      if (moveDirection === 1) {
        nextX -= this.unitSize; // 視覺向右 (座標減小)
      } else if (moveDirection === 2) {
        nextX += this.unitSize; // 視覺向左 (座標增加)
      }

      // 計算移動後的邊界限制
      let leftLimit = this.minX - this.minOffsetX * this.unitSize;
      let rightLimit = this.maxX - (this.maxOffsetX + 1) * this.unitSize;

      // 檢查是否在攝影機畫面內且沒有發生碰撞
      if (nextX >= leftLimit && nextX <= rightLimit) {
        if (!this.checkCollision(nextX, this.y)) {
          this.x = nextX;
        }
      }
    }

    // 2. 處理垂直下落 (採用格狀跳動，不使用平滑移動)
    if (millis() - this.lastFallTime > this.fallInterval) {
      let nextY = this.y + this.unitSize;
      
      // 檢查是否碰撞到堆疊方塊或到達底部
      if (this.checkCollision(this.x, nextY)) {
        this.isFixed = true;
      } else if (nextY + (this.maxOffsetY + 1) * this.unitSize > this.maxY) {
        this.isFixed = true;
      } else {
        this.y = nextY;
      }
      this.lastFallTime = millis();
    }
  }

  // 碰撞偵測函式
  checkCollision(nextX, nextY) {
    for (let cell of stackedBlocks) {
      for (let p_f of this.shape) {
        // 計算當前方塊格子的世界座標 (預計位置)
        let fx = nextX + p_f[0] * this.unitSize;
        let fy = nextY + p_f[1] * this.unitSize;

        // 檢查兩個小格子是否重疊。
        // 使用 0.8 倍的尺寸作為緩衝，避免方塊在掉落過程中因微小的垂直重疊而導致水平移動被鎖死
        if (abs(fx - cell.x) < this.unitSize * 0.8 && abs(fy - cell.y) < this.unitSize * 0.8) {
          return true;
        }
      }
    }
    return false;
  }

  display() {
    push();
    rectMode(CORNER); // 確保俄羅斯方塊從小格子的左上角開始畫
    fill(this.color);
    noStroke();
    for (let p of this.shape) {
      rect(this.x + p[0] * this.unitSize, this.y + p[1] * this.unitSize, this.unitSize, this.unitSize);
    }
    pop();
  }
}

// 消除滿行邏輯
function clearLines(offsetX, imageWidth) {
  let unitSize = 40;
  // 計算畫面上水平方向最多可以容納多少個方格
  let cols = Math.floor(imageWidth / unitSize);
  let rowCounts = {};

  // 1. 統計每一行 (Y 座標) 目前有多少個方格
  for (let b of stackedBlocks) {
    let rowY = Math.round(b.y);
    rowCounts[rowY] = (rowCounts[rowY] || 0) + 1;
  }

  // 2. 找出所有滿行的 Y 座標
  let fullRows = Object.keys(rowCounts)
    .filter(yKey => rowCounts[yKey] >= cols)
    .map(Number);

  if (fullRows.length > 0) {
    // 3. 更新分數
    score += fullRows.length * 100;

    // 4. 先移除所有滿行的方格
    stackedBlocks = stackedBlocks.filter(b => !fullRows.includes(Math.round(b.y)));

    // 5. 讓剩下的方格根據「下方有多少個消除行」來決定往下掉幾格
    for (let b of stackedBlocks) {
      let rowsClearedBelow = fullRows.filter(ry => ry > Math.round(b.y)).length;
      b.y += rowsClearedBelow * unitSize;
    }
  }
}
