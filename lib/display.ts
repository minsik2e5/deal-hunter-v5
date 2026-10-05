// 화면 표시 전용 헬퍼. 원장 데이터(brand/name)는 절대 변경하지 않는다.

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

// 영어 브랜드의 한글 발음 표기. 상품명이 한글 발음으로 시작해도 브랜드 반복으로 본다.
const BRAND_ALIASES: Record<string, string[]> = { stu: ['스투'] };

/** 상품명이 이 브랜드로 시작하면 그 뒤 이름을, 아니면(또는 애매하면) null. */
function stripBrand(brand: string, name: string): string | null {
  let used = 0, pos = 0;
  while (pos < name.length && used < brand.length) {
    const ch = name[pos];
    if (/\s/.test(ch)) { pos++; continue; }
    if (ch.toLowerCase() !== brand[used]) return null;
    used++; pos++;
  }
  if (used < brand.length) return null;
  // 브랜드 바로 뒤가 단어 경계(공백·구분자·끝)일 때만 브랜드 반복으로 본다. (예: 세터리 ≠ 세터)
  const next = name[pos];
  if (next !== undefined && !/[\s\-_·/|:]/.test(next)) return null;
  return name.slice(pos).replace(/^[\s\-_·/|:]+/, '').trim() || null;
}

/** 상품명 앞에 같은 브랜드가 반복되면 그 부분만 뺀 이름을 돌려준다. 확실하지 않으면 원본 그대로. */
export function displayName(item: { brand: string; name: string }): string {
  const key = squash(item.brand || ''), name = item.name || '';
  if (!key) return name.trim();
  for (const brand of [key, ...(BRAND_ALIASES[key] || [])]) {
    const stripped = stripBrand(brand, name);
    if (stripped !== null) return stripped;
  }
  return name.trim();
}

/** "브랜드 상품명" 한 줄 표기 (브랜드 중복 없이). */
export function fullName(item: { brand: string; name: string }): string {
  const name = displayName(item);
  return [item.brand?.trim(), name].filter(Boolean).join(' ');
}

export type AgeBand = { id: string; label: string; min: number; max: number };
/** 겹치지 않는 장기재고 구간 (보유일수 기준). */
export const AGE_BANDS: AgeBand[] = [
  { id: 'b120', label: '120~239일', min: 120, max: 239 },
  { id: 'b240', label: '240~364일', min: 240, max: 364 },
  { id: 'b365', label: '365~729일', min: 365, max: 729 },
  { id: 'b730', label: '730일 이상', min: 730, max: Number.POSITIVE_INFINITY },
];
export const LONG_STOCK_MIN = 120;
export const inBand = (days: number | null, band: { min: number; max: number }) =>
  days !== null && days >= band.min && days <= band.max;
