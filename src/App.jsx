import React, { useState, useEffect, useRef, useCallback } from 'react';
import sigunguData from './sigungu.json';
import MapBoard from './components/MapBoard';
import ParticleLayer from './components/ParticleLayer';
import adjacencyData from './adjacency.json';
import './index.css';

const GAME_STATE = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
};

function App() {
  const [gameState, setGameState] = useState(GAME_STATE.READY);
  const [hpMap, setHpMap] = useState({});
  const [lastSigunguName, setLastSigunguName] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [logs, setLogs] = useState([]);
  const [hoveredRegion, setHoveredRegion] = useState(null);

  const boardWidth = 800;
  const boardHeight = 750;
  const ballRadius = 9;
  const initialSpeed = 15;
  const numBalls = 10;

  const ballsRef = useRef(
    Array.from({ length: numBalls }).map(() => ({
      x: boardWidth / 2,
      y: boardHeight - 30,
      vx: 0,
      vy: 0,
      radius: ballRadius,
      active: true
    }))
  );
  
  const boardRef = useRef(null);
  const ballDOMRefs = useRef([]);
  const arrowRef = useRef(null);
  const particleRef = useRef(null);
  const shakeTimeoutRef = useRef(null);
  const tooltipDOMRef = useRef(null);
  
  const triggerShake = () => {
    setIsShaking(true);
    if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
    shakeTimeoutRef.current = setTimeout(() => {
      setIsShaking(false);
    }, 200);
  };
  
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const activePointerIdRef = useRef(null);
  
  const boxesRef = useRef([]);
  const hpMapRef = useRef({});
  const initialHpMapRef = useRef({});
  const requestRef = useRef(null);

  const handleMapLoaded = useCallback((initialHpMap, boxes) => {
    initialHpMapRef.current = { ...initialHpMap };
    hpMapRef.current = { ...initialHpMap };
    setHpMap(initialHpMap);
    boxesRef.current = boxes;
  }, []);

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  
  const checkHit = (cx, cy, radius) => {
    for (let box of boxesRef.current) {
      if (hpMapRef.current[box.id] > 0) {
        const closestX = clamp(cx, box.x, box.x + box.width);
        const closestY = clamp(cy, box.y, box.y + box.height);
        const distanceX = cx - closestX;
        const distanceY = cy - closestY;
        const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
        if (distanceSquared < (radius * radius)) {
          // 도서지형(섬)이 많아 Bounding Box가 과도하게 큰 해안/도서 지역들은 Pixel-perfect 검증 수행
          const islandRegions = ['인천광역시', '신안군', '완도군', '여수시', '통영시', '남해군', '진도군', '제주시', '서귀포시', '부산광역시'];
          if (islandRegions.some(name => box.name.includes(name))) {
            if (boardRef.current) {
              const rect = boardRef.current.getBoundingClientRect();
              const el = document.elementFromPoint(rect.left + cx, rect.top + cy);
              // 공의 중심(cx, cy)이 실제 해당 행정구역의 SVG path 위에 있을 때만 충돌로 인정
              if (!el || el.getAttribute('data-sigungu-id') !== box.id) {
                continue;
              }
            }
          }
          return box;
        }
      }
    }
    return null;
  };

  const updateGame = () => {
    let anyHit = false;
    let explodedQueue = [];
    let shakeTrigger = false;
    let newDeadBoxes = [];

    let aliveCount = Object.values(hpMapRef.current).filter(hp => hp > 0).length;

    const dealDamage = (id) => {
      if (hpMapRef.current[id] <= 0) return;
      if (aliveCount <= 1) return; // 최후의 1구역은 '플롯 아머(무적)' 판정!

      hpMapRef.current[id] -= 1;
      anyHit = true;
      if (hpMapRef.current[id] === 0) {
        aliveCount -= 1;
        explodedQueue.push(id);
        shakeTrigger = true;
        const box = boxesRef.current.find(b => b.id === id);
        if (box) newDeadBoxes.push(`💥 ${box.name} 탈락!`);
      }
    };

    ballsRef.current.forEach((ball, i) => {
      if (!ball.active) return;

      let { x, y, vx, vy, radius } = ball;
      let newX = x + vx;
      let newY = y + vy;

      if (newX - radius < 0) {
        newX = radius;
        vx = Math.abs(vx);
      } else if (newX + radius > boardWidth) {
        newX = boardWidth - radius;
        vx = -Math.abs(vx);
      }
      if (newY - radius < 0) {
        newY = radius;
        vy = Math.abs(vy);
      } else if (newY + radius > boardHeight) {
        newY = boardHeight - radius;
        vy = -Math.abs(vy);
      }

      let hitX = false;
      let hitY = false;
      let hitBoxId = null;

      const blockX = checkHit(newX, y, radius);
      if (blockX) {
        vx = -vx;
        hitX = true;
        hitBoxId = blockX.id;
        newX = x + vx;
      }

      const blockY = checkHit(x, newY, radius);
      if (blockY) {
        vy = -vy;
        hitY = true;
        if (!hitBoxId) hitBoxId = blockY.id;
        newY = y + vy;
      }
      
      if (!hitX && !hitY) {
        const blockXY = checkHit(newX, newY, radius);
        if (blockXY) {
          vx = -vx;
          vy = -vy;
          hitBoxId = blockXY.id;
          newX = x + vx;
          newY = y + vy;
        }
      }

      if (hitBoxId) {
        dealDamage(hitBoxId);
      }

      ball.x = newX;
      ball.y = newY;
      ball.vx = vx;
      ball.vy = vy;
      
      if (ballDOMRefs.current[i]) {
        ballDOMRefs.current[i].style.transform = `translate(${newX - radius}px, ${newY - radius}px)`;
      }
    });

    if (explodedQueue.length > 0) {
      let head = 0;
      while (head < explodedQueue.length) {
        const expId = explodedQueue[head++];
        const expBox = boxesRef.current.find(b => b.id === expId);
        if (!expBox) continue;
        
        if (particleRef.current) {
          particleRef.current.spawnSparks(expBox.x + expBox.width / 2, expBox.y + expBox.height / 2);
        }

        const neighbors = adjacencyData[expId] || [];
        for (let targetId of neighbors) {
          if (hpMapRef.current[targetId] > 0) {
            const wasAlive = hpMapRef.current[targetId] > 0;
            dealDamage(targetId);
            
            if (wasAlive && hpMapRef.current[targetId] === 0 && particleRef.current) {
              const targetBox = boxesRef.current.find(b => b.id === targetId);
              if (targetBox) {
                particleRef.current.spawnSparks(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
              }
            }
          }
        }
      }
    }

    if (shakeTrigger) triggerShake();

    if (newDeadBoxes.length > 0) {
      setLogs(prev => {
        const nextLogs = [...newDeadBoxes, ...prev];
        return nextLogs.slice(0, 15); // 최신 15개 로그만 유지
      });
    }

    if (anyHit) {
      setHpMap({ ...hpMapRef.current });
    }

    if (aliveCount === 1) {
      const winnerId = Object.keys(hpMapRef.current).find(id => hpMapRef.current[id] > 0);
      const winnerBox = boxesRef.current.find(b => b.id === winnerId);
      if (winnerBox) {
        setLastSigunguName(winnerBox.name);
        setGameState(GAME_STATE.FINISHED);
      }
      return; // 루프 종료
    }

    requestRef.current = requestAnimationFrame(updateGame);
  };

  useEffect(() => {
    if (gameState === GAME_STATE.PLAYING) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = requestAnimationFrame(updateGame);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]); 

  const handlePointerMove = (e) => {
    if (tooltipDOMRef.current) {
      tooltipDOMRef.current.style.left = `${e.clientX + 15}px`;
      tooltipDOMRef.current.style.top = `${e.clientY + 15}px`;
    }

    if (gameState !== GAME_STATE.READY || isDraggingRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ballsRef.current.forEach((ball, i) => {
      if (ballDOMRefs.current[i]) {
        ballDOMRefs.current[i].style.transform = `translate(${x - ball.radius}px, ${y - ball.radius}px)`;
        ballDOMRefs.current[i].style.opacity = 0.5;
      }
    });
    if (arrowRef.current) arrowRef.current.style.display = 'none';
  };

  const cancelDrag = (x, y) => {
    isDraggingRef.current = false;
    if (arrowRef.current) arrowRef.current.style.display = 'none';
    ballsRef.current.forEach((ball, i) => {
      if (ballDOMRefs.current[i]) {
        ballDOMRefs.current[i].style.transform = `translate(${x - ball.radius}px, ${y - ball.radius}px)`;
        ballDOMRefs.current[i].style.opacity = 0.5;
      }
    });
  };

  const handlePointerDown = (e) => {
    if (gameState !== GAME_STATE.READY) return;

    // 이미 다른 포인터(멀티터치)로 드래그 중이면 무시
    if (activePointerIdRef.current !== null) return;

    if (e.target.tagName.toLowerCase() === 'path' && e.target.classList.contains('sigungu-block')) {
      return; 
    }

    // 터치 드래그 중 스크롤/새로고침 제스처 방지
    if (e.cancelable) e.preventDefault();

    const rect = boardRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    isDraggingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    dragStartRef.current = { x: startX, y: startY };

    ballsRef.current.forEach((ball, i) => {
      ball.x = startX;
      ball.y = startY;
      if (ballDOMRefs.current[i]) {
        ballDOMRefs.current[i].style.transform = `translate(${startX - ball.radius}px, ${startY - ball.radius}px)`;
        ballDOMRefs.current[i].style.opacity = 1;
      }
    });

    const onGlobalPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== activePointerIdRef.current) return;
      if (!boardRef.current) return;
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const boardRect = boardRef.current.getBoundingClientRect();
      const mx = moveEvent.clientX - boardRect.left;
      const my = moveEvent.clientY - boardRect.top;

      const dx = dragStartRef.current.x - mx;
      const dy = dragStartRef.current.y - my;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      
      if (arrowRef.current) {
        if (distance > 20) {
          arrowRef.current.style.display = 'block';
          arrowRef.current.style.width = `${Math.min(distance, 150)}px`;
          arrowRef.current.style.transform = `translate(${dragStartRef.current.x}px, ${dragStartRef.current.y}px) rotate(${angle}rad)`;
        } else {
          arrowRef.current.style.display = 'none';
        }
      }
    };

    const onGlobalPointerUp = (upEvent) => {
      if (upEvent.pointerId !== activePointerIdRef.current) return;

      window.removeEventListener('pointermove', onGlobalPointerMove);
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointercancel', onGlobalPointerUp);
      activePointerIdRef.current = null;

      if (!isDraggingRef.current) return;

      if (!boardRef.current) {
        isDraggingRef.current = false;
        return;
      }

      // pointercancel 등으로 위치 정보가 없을 경우 발사 취소
      if (upEvent.type === 'pointercancel') {
        cancelDrag(dragStartRef.current.x, dragStartRef.current.y);
        return;
      }

      const boardRect = boardRef.current.getBoundingClientRect();
      const finalX = upEvent.clientX - boardRect.left;
      const finalY = upEvent.clientY - boardRect.top;

      const dx = dragStartRef.current.x - finalX;
      const dy = dragStartRef.current.y - finalY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 20) {
        isDraggingRef.current = false;
        if (arrowRef.current) arrowRef.current.style.display = 'none';

        const baseAngle = Math.atan2(dy, dx);
        
        ballsRef.current.forEach((ball, i) => {
          const spread = (Math.PI / 12); 
          const offset = -spread + (spread * 2 * (i / (numBalls - 1))); 
          const angle = baseAngle + offset;
          
          ball.vx = initialSpeed * Math.cos(angle);
          ball.vy = initialSpeed * Math.sin(angle);
        });

        setGameState(GAME_STATE.PLAYING);
      } else {
        cancelDrag(dragStartRef.current.x, dragStartRef.current.y);
      }
    };

    window.addEventListener('pointermove', onGlobalPointerMove, { passive: false });
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onGlobalPointerUp);
  };

  const resetGame = () => {
    hpMapRef.current = { ...initialHpMapRef.current };
    setHpMap({ ...initialHpMapRef.current });
    
    ballsRef.current.forEach(ball => {
      ball.vx = 0;
      ball.vy = 0;
    });

    isDraggingRef.current = false;
    if (arrowRef.current) arrowRef.current.style.display = 'none';

    setGameState(GAME_STATE.READY);
    setLogs([]);
  };

  const activeIds = Object.keys(hpMap).filter(id => hpMap[id] > 0);
  const activeCount = activeIds.length;
  const activeNames = activeIds.map(id => {
    const box = boxesRef.current.find(b => b.id === id);
    return box ? box.name : '';
  }).filter(Boolean);

  return (
    <div className="game-container">
      <div className="game-header">
        <h1 className="title">대한민국 알카노이드</h1>
        <p className="subtitle">어디로 떠날지 10개의 구슬에게 맡겨보세요!</p>
      </div>
      
      <div className="game-layout">
        <div className="left-panel">
          <h3>탈락 로그</h3>
          <div className="log-container">
            {logs.map((log, i) => (
              <div key={i} className="log-item">{log}</div>
            ))}
          </div>
        </div>

        <div 
          className={`board-wrapper ${isShaking ? 'shake' : ''}`}
          ref={boardRef}
          style={{ width: boardWidth, height: boardHeight }}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
        >
          <MapBoard 
            sigunguData={sigunguData} 
            onLoaded={handleMapLoaded}
            hpMap={hpMap}
            onRegionHover={(id) => {
              const box = boxesRef.current.find(b => b.id === id);
              if (box) setHoveredRegion({ id, name: box.name });
            }}
            onRegionLeave={() => setHoveredRegion(null)}
          />
          <ParticleLayer ref={particleRef} width={boardWidth} height={boardHeight} ballsRef={ballsRef} />
          
          {ballsRef.current.map((ball, i) => (
            <div 
              key={i}
              ref={el => ballDOMRefs.current[i] = el}
              className="ball"
              style={{
                width: ball.radius * 2,
                height: ball.radius * 2,
                opacity: gameState === GAME_STATE.READY ? 0 : 1, 
                display: gameState === GAME_STATE.READY ? 'block' : (ball.active ? 'block' : 'none')
              }}
            />
          ))}

          {gameState === GAME_STATE.READY && (
            <div ref={arrowRef} className="slingshot-arrow"></div>
          )}

          {gameState === GAME_STATE.READY && (
            <div className="overlay-message">
              <h3>원하는 해상에서 드래그하여 발사하세요</h3>
            </div>
          )}

          {gameState === GAME_STATE.FINISHED && (
            <div className="game-over-modal">
              <h2>🎉 축하합니다! 🎉</h2>
              <p>이번 여행지는 <span>{lastSigunguName}</span> 입니다!</p>
              <button onClick={resetGame} className="reset-btn">다시 추천받기</button>
            </div>
          )}
        </div>
        
        <div className="side-panel">
          <div className="stats">
            <span className="stats-title">생존 구역 ({activeCount})</span>
            <div className="survivor-list">
              {activeNames.map((name, i) => (
                <div key={i} className="survivor-item">{name}</div>
              ))}
            </div>
          </div>
          <button className="side-reset-btn" onClick={resetGame}>다시 뽑기</button>
        </div>
      </div>
      
      {hoveredRegion && hpMap[hoveredRegion.id] > 0 && (
        <div className="region-tooltip" ref={tooltipDOMRef}>
          <strong>{hoveredRegion.name}</strong>
          <span>내구도: {hpMap[hoveredRegion.id]}</span>
        </div>
      )}
    </div>
  );
}

export default App;
