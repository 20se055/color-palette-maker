'use strict';

// ===== パレット名の自動生成 =====
const NAME_WORDS = [
  // [色相の上限, 名詞の候補]
  [15, ['いちご', 'りんご', '紅茶', '口紅']],
  [45, ['みかん', '夕焼け', 'キャラメル', 'たき火']],
  [70, ['レモン', 'ひまわり', 'たまご', 'はちみつ']],
  [160, ['若葉', 'メロン', '森', '抹茶']],
  [200, ['ミント', 'ラムネ', 'ソーダ', '湖']],
  [250, ['空', '海', 'ブルーハワイ', '夜明け']],
  [290, ['すみれ', 'ぶどう', 'ラベンダー', '宵']],
  [345, ['さくら', 'もも', 'ベリー', 'マカロン']],
  [360, ['いちご', 'りんご', '紅茶', '口紅']],
];
const NAME_NOUNS = ['ワルツ', '休日', '散歩道', 'パレード', 'ひみつ', '午後', 'おまもり', 'ものがたり', '交差点', 'アトリエ'];
const FUNNY_TEMPLATES = [
  (w) => `${w}を食べすぎた日`,
  (w) => `たぶん${w}`,
  (w, w2) => `${w}、ときどき${w2}`,
  (w) => `${w}色の言い訳`,
  (w) => `${w}に恋したペンギン`,
  (w) => `${w}って言い張る色`,
  (w) => `${w}味のため息`,
  (w) => `部長の${w}`,
  (w) => `${w}(期間限定)`,
  (w) => `${w}の逆襲`,
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// hsl は { h, s, l } の配列。代表色の色相と全体の明るさ・鮮やかさから名前を作る
function suggestName(hsls) {
  const avgL = hsls.reduce((a, c) => a + c.l, 0) / hsls.length;
  const avgS = hsls.reduce((a, c) => a + c.s, 0) / hsls.length;
  // 見た目の鮮やかさ (明るすぎ・暗すぎる色は彩度が高くても鮮やかに見えない)
  const chroma = (c) => c.s * (1 - Math.abs((2 * c.l) / 100 - 1));
  const sorted = [...hsls].sort((a, b) => chroma(b) - chroma(a));
  const wordFor = (c) => (chroma(c) < 8
    ? pick(['雨雲', '鉛筆', '石畳', '月', 'コンクリート'])
    : pick(NAME_WORDS.find(([max]) => c.h < max)[1]));
  const w = wordFor(sorted[0]);
  let w2 = wordFor(sorted[1] || sorted[0]);
  if (w2 === w) w2 = wordFor({ ...sorted[0], h: (sorted[0].h + 180) % 360 });

  if (Math.random() < 0.15) return pick(FUNNY_TEMPLATES)(w, w2);

  let mood;
  if (avgS < 22) mood = pick(['くすみ', 'しっとり', '静かな', 'グレイッシュ']);
  else if (avgL > 76) mood = pick(['ふんわり', 'ゆめかわ', 'ミルキー', 'やさしい']);
  else if (avgL < 36) mood = pick(['真夜中の', '大人の', 'ひみつの', 'ビターな']);
  else if (avgS > 70) mood = pick(['はじける', '元気な', 'ポップな', 'まぶしい']);
  else mood = pick(['きょうの', 'いつもの', 'となりの', 'まどろむ']);

  return Math.random() < 0.5 ? `${mood}${w}` : `${w}と${w2}の${pick(NAME_NOUNS)}`;
}
