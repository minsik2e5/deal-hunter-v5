// 친구용 접속 코드 → 운영 비밀 설정(DEAL_HUNTER_WORKSPACES)에 넣을 한 줄을 만든다.
// 사용: node scripts/hash-code.mjs friend1   → 코드를 입력하면 "friend1:<sha256>" 출력
// 코드 자체는 저장하거나 출력하지 않는다. 출력된 한 줄도 저장소에 커밋하지 말 것.
import { createHash } from 'node:crypto';
import readline from 'node:readline';

const name = (process.argv[2] || '').trim();
if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(name) || name === 'main') {
  console.error('작업공간 이름을 영문 소문자·숫자로 주세요 (main 제외). 예: node scripts/hash-code.mjs friend1');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (s) => { if (s.includes('접속 코드')) process.stdout.write(s); }; // 입력한 코드는 화면에 표시하지 않음
rl.question('친구 접속 코드 입력 (화면에 안 보임): ', (code) => {
  rl.close();
  process.stdout.write('\n');
  if (code.length < 8) { console.error('접속 코드는 8자 이상으로 정해 주세요.'); process.exit(1); }
  console.log(`${name}:${createHash('sha256').update(code, 'utf8').digest('hex')}`);
  console.log('↑ 이 한 줄을 운영 비밀 설정 DEAL_HUNTER_WORKSPACES에 넣으세요. 여러 명이면 쉼표로 이어 붙입니다.');
});
