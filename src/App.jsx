import React, { useState, useEffect, useRef, useCallback } from 'react';
import sigunguData from './sigungu.json';
import MapBoard from './components/MapBoard';
import ParticleLayer from './components/ParticleLayer';
import adjacencyData from './adjacency.json';
import destinations from './destinations.json';

const getRegionInfo = (name) => {
  if (destinations[name]) {
    return destinations[name];
  }
  return {
    desc: `${name}만의 숨겨진 매력과 자연 속 힐링을 찾아 떠나는 특별한 여행을 즐겨보세요!`,
    tags: [`#${name}여행`, `#${name}가볼만한곳`, `#국내여행`, `#힐링여행`]
  };
};
import './index.css';

const GAME_STATE = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
};

// Box-Muller 변환으로 표준정규분포(평균 0, 표준편차 1) 난수 생성
const gaussianRandom = () => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // 0 방지 (log(0) 예외)
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

// 결정론적 기본 체력맵(base)에 매 판 랜덤 지터를 적용해 새 체력맵을 반환한다.
// 지터는 중간 티어(녹색 HP 4 ~ 파란색 HP 5)에만 적용한다:
// 강원도(춘천 등)처럼 면적·접점 위상으로 단단하게 튜닝한 상위 티어(보라/흰색/제주)와
// 의도적으로 약하게 눌러둔 위성도시(HP 1~3)는 건드리지 않아 밸런스 의도를 보존한다.
// 중립 지대인 HP 4~5 구역에만 소폭(σ≈1) 변주를 줘 리플레이 다양성을 확보하되,
// 결과를 HP 3~6 밴드로 clamp해 상·하위 티어(색상/의도 체계)로 새지 않게 한다.
const rollHpMap = (baseMap) => {
  const rolled = {};
  Object.keys(baseMap).forEach(id => {
    const baseHp = baseMap[id];
    if (baseHp < 4 || baseHp > 18) {
      rolled[id] = baseHp;
      return;
    }
    const jitter = Math.round(gaussianRandom() * 1); // σ≈1, 대부분 -2 ~ +2
    rolled[id] = Math.min(18, Math.max(3, baseHp + jitter));
  });
  return /*rolled;*/ applyGlobalNerf(rolled);
};

const applyGlobalNerf = (hpMap) => {
  const nerfed = {};
  Object.keys(hpMap).forEach(id => {
    if (hpMap[id] >= 5)
      nerfed[id] = Math.max(3, Math.round(hpMap[id] * 0.9));
    else
      nerfed[id] = hpMap[id];
  });
  return nerfed;
};

function App() {
  const [gameState, setGameState] = useState(GAME_STATE.READY);
  const [hpMap, setHpMap] = useState({});
  const [lastSigunguName, setLastSigunguName] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [logs, setLogs] = useState([]);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [boardScale, setBoardScale] = useState(1);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [showDragText, setShowDragText] = useState(true);
  const [isFastForward, setIsFastForward] = useState(false);
  const isFastForwardRef = useRef(false);

  const toggleFastForward = () => {
    isFastForwardRef.current = !isFastForwardRef.current;
    setIsFastForward(isFastForwardRef.current);
  };

  const boardWidth = 800;
  const boardHeight = 750;
  const ballRadius = 9;
  const initialSpeed = 15;
  const numBalls = 20;

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
  const baseHpMapRef = useRef({});
  const requestRef = useRef(null);
  const destroyedCountRef = useRef(0);

  const handleMapLoaded = useCallback((baseHpMap, boxes) => {
    // 지터 전 결정론적 기본 맵을 보관하고, 첫 판 분포를 리롤해 적용한다.
    baseHpMapRef.current = { ...baseHpMap };
    const rolled = rollHpMap(baseHpMap);
    hpMapRef.current = { ...rolled };
    setHpMap(rolled);
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
          const islandRegions = ['서울특별시', '인천광역시', '신안군', '완도군', '진도군', '제주시', '서귀포시', '부산광역시'];
          if (islandRegions.some(name => box.name.includes(name))) {
            if (boardRef.current) {
              const rect = boardRef.current.getBoundingClientRect();
              // 모바일에서는 보드가 transform: scale()로 축소되므로 논리 좌표(cx, cy)를
              // 화면 좌표로 변환할 때 실제 렌더링 배율을 곱해줘야 한다.
              const scale = rect.width / boardWidth;
              const el = document.elementFromPoint(rect.left + cx * scale, rect.top + cy * scale);
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
    let globalAnyHit = false;
    let globalNewDeadBoxes = [];
    let shouldFinish = false;
    
    const iters = isFastForwardRef.current ? 2 : 1;
    for (let iter = 0; iter < iters; iter++) {
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
        if (box) {
          newDeadBoxes.push(`💥 ${box.name} 탈락!`);

          destroyedCountRef.current += 1;
          if (destroyedCountRef.current % 5 === 0) {
            const angle = Math.random() * Math.PI * 2;
            ballsRef.current.push({
              x: box.x + box.width / 2,
              y: box.y + box.height / 2,
              vx: initialSpeed * Math.cos(angle),
              vy: initialSpeed * Math.sin(angle),
              radius: ballRadius,
              active: true
            });
            const textId = Date.now() + Math.random();
            setFloatingTexts(prev => [...prev, { id: textId, x: box.x + box.width / 2, y: box.y + box.height / 2 }]);
            setTimeout(() => {
              setFloatingTexts(prev => prev.filter(ft => ft.id !== textId));
            }, 1000);
          }
        }
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

      globalNewDeadBoxes.push(...newDeadBoxes);
      globalAnyHit = globalAnyHit || anyHit;

      if (aliveCount === 1) {
        shouldFinish = true;
        break;
      }
    }

    if (globalNewDeadBoxes.length > 0) {
      setLogs(prev => {
        const nextLogs = [...globalNewDeadBoxes, ...prev];
        return nextLogs.slice(0, 15); // 최신 15개 로그만 유지
      });
    }

    if (globalAnyHit) {
      setHpMap({ ...hpMapRef.current });
    }

    if (shouldFinish) {
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

  // 화면 크기에 맞춰 보드 스케일 계산 (물리 좌표계는 800x750 유지)
  useEffect(() => {
    const computeScale = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = vw <= 900;

      if (!isMobile) {
        setBoardScale(1);
        return;
      }

      // 모바일: 좌우 여백을 제외한 가용 폭/높이에 맞춰 축소 (확대는 하지 않음)
      const availableWidth = vw - 16; // 좌우 8px 여백
      const availableHeight = vh - 96; // 헤더/여백 공간
      const scale = Math.min(availableWidth / boardWidth, availableHeight / boardHeight, 1);
      setBoardScale(scale);
    };

    computeScale();
    window.addEventListener('resize', computeScale);
    window.addEventListener('orientationchange', computeScale);
    return () => {
      window.removeEventListener('resize', computeScale);
      window.removeEventListener('orientationchange', computeScale);
    };
  }, []);

  const handlePointerMove = (e) => {
    if (tooltipDOMRef.current) {
      tooltipDOMRef.current.style.left = `${e.clientX + 15}px`;
      tooltipDOMRef.current.style.top = `${e.clientY + 15}px`;
    }

    if (gameState !== GAME_STATE.READY || isDraggingRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const scale = rect.width / boardWidth;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

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
    setShowDragText(true);
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
    const startScale = rect.width / boardWidth;
    const startX = (e.clientX - rect.left) / startScale;
    const startY = (e.clientY - rect.top) / startScale;

    isDraggingRef.current = true;
    setShowDragText(false);
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
      const moveScale = boardRect.width / boardWidth;
      const mx = (moveEvent.clientX - boardRect.left) / moveScale;
      const my = (moveEvent.clientY - boardRect.top) / moveScale;

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
      const upScale = boardRect.width / boardWidth;
      const finalX = (upEvent.clientX - boardRect.left) / upScale;
      const finalY = (upEvent.clientY - boardRect.top) / upScale;

      const dx = dragStartRef.current.x - finalX;
      const dy = dragStartRef.current.y - finalY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 20) {
        isDraggingRef.current = false;
        if (arrowRef.current) arrowRef.current.style.display = 'none';

        const baseAngle = Math.atan2(dy, dx);

        ballsRef.current.forEach((ball, i) => {
          let angle;
          if (i === 0) {
            // 첫 번째 공은 화살표 방향을 정확히 따라감
            angle = baseAngle;
          } else {
            // 나머지 공들은 +-75도 범위 내에서 랜덤하게 퍼짐
            const randomJitter = (Math.random() - 0.5) * (150 * Math.PI / 180);
            angle = baseAngle + randomJitter;
          }

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
    // 다시 뽑기마다 기본 맵으로부터 분포를 새로 리롤한다.
    const rolled = rollHpMap(baseHpMapRef.current);
    hpMapRef.current = { ...rolled };
    setHpMap(rolled);

    destroyedCountRef.current = 0;
    ballsRef.current = Array.from({ length: numBalls }).map(() => ({
      x: boardWidth / 2,
      y: boardHeight - 30,
      vx: 0,
      vy: 0,
      radius: ballRadius,
      active: true
    }));

    isDraggingRef.current = false;
    setShowDragText(true);
    if (arrowRef.current) arrowRef.current.style.display = 'none';

    setGameState(GAME_STATE.READY);
    setLogs([]);
    setFloatingTexts([]);
    isFastForwardRef.current = false;
    setIsFastForward(false);
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
        <h1 className="title">국내 여행 알카노이드</h1>
        <p className="subtitle">어디로 떠날지 구슬에게 맡겨보세요!</p>
        <button className="mobile-reset-btn" onClick={resetGame}>다시 뽑기</button>
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
          className={`board-scaler ${isShaking ? 'shake' : ''}`}
          style={{
            width: boardWidth * boardScale,
            height: boardHeight * boardScale,
          }}
        >
          <div
            className="board-wrapper"
            ref={boardRef}
            style={{
              width: boardWidth,
              height: boardHeight,
              transform: `scale(${boardScale})`,
              transformOrigin: 'top left',
            }}
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

            {gameState === GAME_STATE.READY && showDragText && (
              <div className="overlay-message">
                <h2 className="drag-start-text">
                  <span className="arrows">
                    <span className="arrow arr-outer">&gt;</span>
                    <span className="arrow arr-mid">&gt;</span>
                    <span className="arrow arr-inner">&gt;</span>
                  </span>
                  <span className="text-body">바다를 드래그하여 시작</span>
                  <span className="arrows">
                    <span className="arrow arr-inner">&lt;</span>
                    <span className="arrow arr-mid">&lt;</span>
                    <span className="arrow arr-outer">&lt;</span>
                  </span>
                </h2>
              </div>
            )}

            {gameState === GAME_STATE.FINISHED && (
              (() => {
                const info = getRegionInfo(lastSigunguName);
                return (
                  <div className="game-over-modal">
                    <h2>🎉 축하합니다! 🎉</h2>
                    <p>이번 여행지는 <span>{lastSigunguName}</span> 입니다!</p>
                    <div className="region-info">
                      <p className="region-desc">{info.desc}</p>
                      <div className="region-tags">
                        {info.tags.map((tag, idx) => {
                          const query = encodeURIComponent(`${lastSigunguName} ${tag.replace('#', '')}`);
                          return (
                            <a
                              key={idx}
                              href={`https://www.google.com/search?q=${query}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="region-tag"
                            >
                              {tag}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                    <button onClick={resetGame} className="reset-btn">다시 추천받기</button>
                  </div>
                );
              })()
            )}

            {floatingTexts.map(ft => (
              <div
                key={ft.id}
                className="floating-plus-one"
                style={{
                  left: ft.x,
                  top: ft.y
                }}
              >
                +1
              </div>
            ))}
          </div>
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

      {gameState === GAME_STATE.PLAYING && (
        <button
          className={`fast-forward-btn ${isFastForward ? 'active' : ''}`}
          onClick={toggleFastForward}
        >
          {isFastForward ? '▶▶ 2X속도' : '▶ 1X속도'}
        </button>
      )}
    </div>
  );
}

export default App;
