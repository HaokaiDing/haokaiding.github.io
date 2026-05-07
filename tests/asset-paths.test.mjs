import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = relativePath => readFileSync(join(root, relativePath), 'utf8');

const html = [
  read('index.html'),
  read('publications.html'),
  read('contact.html'),
].join('\n');

const toTokenRegex = assetPath => {
  const escaped = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|["'(=\\s])${escaped}(?:$|["')\\s])`);
};

const expectedPaths = [
  'assets/images/haokai-ding-cartoon.png',
  'assets/images/haokai-ding-photo.png',
  'assets/images/shenzhen-technology-university-logo.jpg',
  'assets/images/tsinghua-university-logo.svg',
  'assets/images/x-institute-logo.jpg',
  'assets/images/shanghai-jiao-tong-university-logo.svg',
  'assets/images/ditang-wechat-qr.jpg',
  'assets/pdfs/haokai-ding-cv.pdf',
  'assets/pdfs/iros-2025-semi-peaucellier-gripper.pdf',
  'assets/pdfs/case-2025-semi-peaucellier-linkage.pdf',
  'assets/pdfs/raai-2025-double-parallelogram-gripper.pdf',
  'assets/pdfs/iccma-2025-glint.pdf',
  'assets/pdfs/robio-2025-biocrest.pdf',
  'assets/pdfs/icia-2025-grasshopper-gripper.pdf',
  'assets/pdfs/icarm-2025-peaucellier-gripper.pdf',
  'assets/pdfs/e3s-2025-heavy-metal-libs.pdf',
  'assets/pdfs/polymers-2025-zinc-ion-batteries-review.pdf',
  'assets/videos/semi-peaucellier-gripper-demo-compressed.mp4',
];

const oldReferencedPaths = [
  'my-academic-site/images/haokai_DING_photo_cartoon.png',
  'my-academic-site/images/hkding.png',
  'my-academic-site/images/深圳技术大学校徽_00.jpg',
  'my-academic-site/images/Tsinghua_University_Logo.svg',
  'my-academic-site/images/x-institute_logo.jpg',
  'my-academic-site/images/sjtulogored.svg',
  'my-academic-site/images/wechat_qr_ditang.jpg',
  'my-academic-site/images/haokai-ding-cartoon.png',
  'my-academic-site/images/haokai-ding-photo.png',
  'my-academic-site/images/shenzhen-technology-university-logo.jpg',
  'my-academic-site/images/tsinghua-university-logo.svg',
  'my-academic-site/images/x-institute-logo.jpg',
  'my-academic-site/images/shanghai-jiao-tong-university-logo.svg',
  'my-academic-site/images/ditang-wechat-qr.jpg',
  'pdfs/Haokai_CV_EN.pdf',
  'pdfs/200534-3633.pdf',
  'pdfs/Semi-Peaucellier_Linkage_and_Differential_Mechanism_for_Linear_Pinching_and_Self-Adaptive_Grasping.pdf',
  'pdfs/RAAI2025.pdf',
  'pdfs/ICCMA-GLINT_An_Idle-Stroke_Grasp-and-Lift_Hand_for_In-Hand_Manipulation.pdf',
  'pdfs/DHK-ROBIO2025-10-02-v4.pdf',
  'pdfs/icia_v4.pdf',
  'pdfs/ICARM25.pdf',
  'pdfs/e3sconf_eppc2025_02010.pdf',
  'pdfs/haokai-ding-cv.pdf',
  'pdfs/iros-2025-semi-peaucellier-gripper.pdf',
  'pdfs/case-2025-semi-peaucellier-linkage.pdf',
  'pdfs/raai-2025-double-parallelogram-gripper.pdf',
  'pdfs/iccma-2025-glint.pdf',
  'pdfs/robio-2025-biocrest.pdf',
  'pdfs/icia-2025-grasshopper-gripper.pdf',
  'pdfs/icarm-2025-peaucellier-gripper.pdf',
  'pdfs/e3s-2025-heavy-metal-libs.pdf',
  'pdfs/polymers-2025-zinc-ion-batteries-review.pdf',
  'videos/SPIDAPT.mp4',
  'videos/semi-peaucellier-gripper-demo.mp4',
];

for (const assetPath of expectedPaths) {
  assert.match(
    html,
    toTokenRegex(assetPath),
    `expected normalized asset path ${assetPath} to be referenced in the site`,
  );
}

for (const assetPath of oldReferencedPaths) {
  assert.doesNotMatch(
    html,
    toTokenRegex(assetPath),
    `expected old asset path ${assetPath} to be removed from the site`,
  );
}

console.log('asset-path checks passed');
