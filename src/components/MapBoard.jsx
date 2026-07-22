import React, { useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3-geo';
import sigunguData from '../sigungu.json';

const COASTAL_AND_BORDER_CITIES = [
  "강화군", "옹진군", "김포시", "파주시", "연천군", "철원군", "화천군", "양구군", "인제군",
  "고성군", "속초시", "양양군", "강릉시", "동해시", "삼척시", "울진군", "영덕군", "포항시",
  "경주시", "기장군", "해운대구", "수영구", "영도구", "사하구", "창원시", "거제시", "통영시",
  "사천시", "남해군", "하동군", "광양시", "여수시", "고흥군", "보성군", "장흥군", "강진군",
  "해남군", "진도군", "완도군", "목포시", "신안군", "무안군", "함평군", "영광군", "고창군",
  "부안군", "김제시", "군산시", "서천군", "보령시", "홍성군", "태안군", "서산시", "당진시",
  "평택시", "화성시", "안산시", "시흥시",
  "부산광역시", "울산광역시", "인천광역시"
];

const MERGED_CODES = new Set([
  '11', '21', '22', '23', '24', '25', '26',
  '31010', '31020', '31040', '31050', '31090', '31100', '31190',
  '33010', '34010', '35010', '37010', '38110'
]);

const TOURIST_CITIES = [
  "서울특별시", "부산광역시", "경주시", "전주시",
  "여수시", "강릉시", "속초시", "춘천시", "안동시", "통영시", "인천광역시", "수원시", "순천시"
];

const LEISURE_CITIES = [
  "가평군", "담양군", "평창군", "양평군", "홍천군", "정선군",
  "단양군", "포천시", "무주군", "태안군", "거제시", "영월군", "보령시"
];

const SMALL_CITIES = [
  "군포시", "의왕시", "과천시", "구리시", "하남시", "광명시", "동두천시", "오산시", "안양시"
];

// 지리적 특성으로 인해 지나치게 오래 살아남는 '도넛 홀' 지형 등 밸런스 패치
const SURVIVAL_EXPERTS = [
  "사천시", "속초시", "전주시", "수원시"
];

// 특색 있는 지역 명소나 관광지가 있는 내륙 도시들 (파란색 등급 상향)
const LOCAL_ATTRACTION_CITIES = [
  "남원시", "부여군", "공주시", "문경시", "제천시",
  "진주시", "합천군", "영주시", "곡성군", "구례군", "포항시", "군산시"
];

// 강원도 특별 버프
const KANGWON_SPECIAL = [
  "평창군", "홍천군", "양평군", "정선군", "춘천시", "인제군", "화천군", "강릉시"
];

const MapBoard = ({ sigunguData, onLoaded, hpMap, onRegionHover, onRegionLeave, width = 800, height = 750 }) => {
  const svgRef = useRef(null);

  const projection = useMemo(() => {
    // 북쪽(위쪽) 공간을 105px로 조정하여 지도를 위로 15px 다시 올림
    return d3.geoMercator().fitExtent([[20, 105], [width - 20, height - 65]], sigunguData);
  }, [width, height, sigunguData]);

  const pathGenerator = useMemo(() => d3.geoPath().projection(projection), [projection]);

  useEffect(() => {
    if (!svgRef.current || !onLoaded) return;

    const paths = svgRef.current.querySelectorAll('.sigungu-block');
    const boxes = [];
    paths.forEach(path => {
      const id = path.getAttribute('data-sigungu-id');
      const name = path.getAttribute('data-sigungu-name');
      const bbox = path.getBBox();
      boxes.push({ id, name, x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height });
    });

    const initialHpMap = {};
    boxes.forEach(box => {
      initialHpMap[box.id] = 4;
      const isJeju = box.id.startsWith('39');
      let isOutermost = false;

      for (let borderName of COASTAL_AND_BORDER_CITIES) {
        if (box.name.includes(borderName)) {
          isOutermost = true;
          break;
        }
      }

      if (isJeju) {
        initialHpMap[box.id] = 6;
      } else if (isOutermost) {
        initialHpMap[box.id] = 5;
      }

      for (let tourist of TOURIST_CITIES) {
        if (box.name.includes(tourist)) {
          initialHpMap[box.id] += 16;
          break;
        }
      }

      for (let tourist of COASTAL_AND_BORDER_CITIES) {
        if (box.name.includes(tourist)) {
          initialHpMap[box.id] += 4;
          break;
        }
      }

      for (let leisure of LEISURE_CITIES) {
        if (box.name.includes(leisure)) {
          initialHpMap[box.id] += 8;
          break;
        }
      }

      for (let leisure of KANGWON_SPECIAL) {
        if (box.name.includes(leisure)) {
          initialHpMap[box.id] += 1;
          break;
        }
      }

      for (let small of SMALL_CITIES) {
        if (box.name.includes(small)) {
          initialHpMap[box.id] = Math.max(1, initialHpMap[box.id] - 1);
          break;
        }
      }

      // 소소하지만 확실한 특색 있는 명소들이 있는 지역들은 내구도 +1 (초록색 -> 파란색 상향)
      for (let attraction of LOCAL_ATTRACTION_CITIES) {
        if (box.name.includes(attraction)) {
          initialHpMap[box.id] += 3;
          break;
        }
      }

      // 제주는 어나더 레벨로 설정 (+15 추가 부여)
      if (box.name.includes('제주시') || box.name.includes('서귀포시')) {
        initialHpMap[box.id] += 21;
      }

      // 너무 잘 살아남는 도시들은 페널티 대폭 적용 (-3)
      for (let expert of SURVIVAL_EXPERTS) {
        if (box.name.includes(expert)) {
          initialHpMap[box.id] = Math.max(1, initialHpMap[box.id] - 2);
          break;
        }
      }
    });

    // 상주시 크기(Bounding Box 기준) 이상의 거대 행정구역에 +2 내구도 보너스 부여 (피격 확률 보정)
    const sangjuBox = boxes.find(b => b.name && b.name.includes('상주시'));
    if (sangjuBox) {
      // SVG 바운딩 박스 오차를 고려해 상주시 크기의 98% 이상이면 큰 지역으로 판별
      const sangjuArea = sangjuBox.width * sangjuBox.height * 0.98;
      boxes.forEach(box => {
        const area = box.width * box.height;
        if (area >= sangjuArea) {
          initialHpMap[box.id] += 2;
        }
      });
    }

    // 서울, 인천, 부산 체력 고정 및 추가 밸런스 패치 (모든 base 보정 이후 적용)
    boxes.forEach(box => {
      if (box.name.includes('서울특별시')) {
        initialHpMap[box.id] = 20;
      } else if (box.name.includes('인천광역시') || box.name.includes('부산광역시')) {
        initialHpMap[box.id] = 24;
      } else if (box.name.includes('대구광역시') || box.name.includes('대전광역시') || box.name.includes('광주광역시') || box.name.includes('울산광역시')) {
        initialHpMap[box.id] += 7;
      }

      if (box.name.includes('수원시') || box.name.includes('통영시')) {
        initialHpMap[box.id] = Math.max(1, initialHpMap[box.id] - 10);
      }

      if (box.name.includes('춘천시')) {
        initialHpMap[box.id] = 20;
      }

      if (box.name.includes('전주시')) {
        initialHpMap[box.id] = 11;
      }

      if (box.name.includes('울릉군')) {
        initialHpMap[box.id] = 10;
      }
      if (box.name.includes('통영시')) {
        initialHpMap[box.id] = 13;
      }
      if (box.name.includes('속초시')) {
        initialHpMap[box.id] = 19;
      }

    });

    // 랜덤 지터는 App에서 '다시 뽑기'마다 새로 적용하므로, 여기서는 지터 전
    // 결정론적 기본(base) 체력맵을 그대로 넘긴다.
    onLoaded(initialHpMap, boxes);
  }, [onLoaded]);

  const getColorByHp = (hp) => {
    if (hp >= 18) return 'url(#jeju-rainbow)';
    if (hp >= 11) return '#ffffff';
    if (hp >= 6) return '#a855f7';
    if (hp === 5) return '#3b82f6';
    if (hp === 4) return '#22c55e';
    if (hp === 3) return '#eab308';
    if (hp === 2) return '#f97316';
    if (hp === 1) return '#ef4444';
    return 'transparent';
  };

  return (
    <div style={{ position: 'relative', width: width, height: height }}>
      <svg
        ref={svgRef}
        className="map-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          display: 'block',
          backgroundColor: '#0f172a',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '4px solid #1e293b'
        }}
      >
        <defs>
          <linearGradient id="jeju-rainbow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff4b4b" />
            <stop offset="20%" stopColor="#f97316" />
            <stop offset="40%" stopColor="#eab308" />
            <stop offset="60%" stopColor="#22c55e" />
            <stop offset="80%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <g>
          {sigunguData.features.map((feature, idx) => {
            const id = feature.properties.code;
            const name = feature.properties.name || '알 수 없음';
            const hp = hpMap[id] || 0;
            const isActive = hp > 0;
            const isMerged = MERGED_CODES.has(id);
            const isRainbow = hp >= 18;

            let fillColor = getColorByHp(hp);

            return (
              <path
                key={idx}
                data-sigungu-id={id}
                data-sigungu-name={name}
                className="sigungu-block"
                d={pathGenerator(feature)}
                onMouseEnter={() => onRegionHover && onRegionHover(id)}
                onMouseLeave={() => onRegionLeave && onRegionLeave()}
                style={{
                  fill: fillColor,
                  stroke: isActive ? (isRainbow ? '#ef4444' : (isMerged ? fillColor : '#1e293b')) : 'transparent',
                  strokeWidth: isRainbow ? 3 : (isMerged ? 1.5 : 1),
                  strokeLinejoin: 'round',
                  transition: 'fill 0.1s, stroke 0.1s',
                  opacity: isActive ? 1 : 0,
                  pointerEvents: isActive ? 'auto' : 'none'
                }}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default MapBoard;
