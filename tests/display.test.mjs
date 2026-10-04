import test from 'node:test';
import assert from 'node:assert/strict';
import { displayName, fullName, AGE_BANDS, inBand } from '../lib/display.ts';

test('브랜드가 상품명 앞에 반복되면 화면에서만 뺀다', () => {
  assert.equal(displayName({ brand: '렉토', name: '렉토 그린 트위드 자켓' }), '그린 트위드 자켓');
  assert.equal(displayName({ brand: 'STU', name: 'STU 스웨이드 레더 라이더 자켓' }), '스웨이드 레더 라이더 자켓');
  assert.equal(displayName({ brand: '보테가베네타', name: '보테가 베네타 퍼들 부츠' }), '퍼들 부츠');
});
test('확실하지 않으면 원본 그대로 둔다', () => {
  assert.equal(displayName({ brand: '세터', name: '세터리 자켓' }), '세터리 자켓');
  assert.equal(displayName({ brand: '세터', name: '키링' }), '키링');
  assert.equal(displayName({ brand: '세터', name: '세터' }), '세터');
  assert.equal(displayName({ brand: '', name: '브로치' }), '브로치');
  assert.equal(displayName({ brand: '앤더슨벨', name: '엔더슨벨 톰 리버스 진' }), '엔더슨벨 톰 리버스 진');
});
test('fullName은 브랜드를 한 번만 쓴다', () => {
  assert.equal(fullName({ brand: '렉토', name: '렉토 단추 니트' }), '렉토 단추 니트');
  assert.equal(fullName({ brand: 'STU', name: '오렌지 키링' }), 'STU 오렌지 키링');
});
test('장기재고 구간은 겹치지 않고 빠짐없다', () => {
  for (const d of [0, 119, 120, 239, 240, 364, 365, 729, 730, 5000]) {
    const hit = AGE_BANDS.filter(b => inBand(d, b)).length;
    assert.equal(hit, d < 120 ? 0 : 1, `day ${d}`);
  }
  assert.equal(inBand(null, AGE_BANDS[0]), false);
});
