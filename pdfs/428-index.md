# 《428.pdf》索引：BioCrest - A Flexible Adaptive Robotic Hand Based on Idle-Stroke Mechanism

## 元信息
- **标题**：BioCrest - A Flexible Adaptive Robotic Hand Based on Idle-Stroke Mechanism
- **作者**：Haokai Ding（丁浩剀，独立第一作者）
- **合作者说明**：无共同第一作者；该索引聚焦丁浩剀主导的研究成果
- **研究关键词**：自适应抓手、欠驱动机制、Idle-Stroke、柔顺夹持、并联夹爪
- **总页数**：6 页
- **文件路径**：`pdfs/428.pdf`

## 目录概览
1. **摘要（第 1 页）**
   - 概述单电机驱动的两指三自由度 BioCrest 抓手，兼具精密平行夹持与柔顺包络抓取。
   - 亮点包含 Idle-Stroke 传动、柔顺指节设计，以及运动学/力学分析与实验验证。

2. **I. INTRODUCTION（第 1 页）**
   - 阐述现有抓手在精准夹持与柔顺抓取之间的矛盾，以及多自由度手爪的复杂度瓶颈。
   - 引入 BioCrest 的极简结构（单电机、三刚体连杆 + 柔顺指节 + 指尖）和三大能力：高精度平行夹持、高柔顺包络抓取、模式间主动可控切换。

3. **II. IMPLEMENTATION OF THE GRASPING MODES（第 2–3 页）**
   - **A. Precision Parallel Pinch Mode**：通过拓扑优化的平行四边形连杆与可调预紧扭簧，实现毫米级平行夹持，并抑制冲击与背隙。
   - **B. Self-adaptive Enveloping Grasp Mode**：利用 Idle-Stroke 机构调节输出刚度，驱动柔顺指节进行被动包络；通过齿轮-凸轮啮合实现力控弯曲与自适应贴合。

4. **III. DESIGN OF THE BIOCREST FINGER（第 3–4 页）**
   - **A. Design of the flexure strip**：柔顺指节采用 TPU 蜂窝结构，FDM 一体打印，厚度仅 0.8 mm，兼顾耐撕裂与弹性回复。
   - **B. Structural Configuration**：手指由远节（DP）、柔顺节（FP）与凸轮驱动连杆（CDL）组成；对称扭簧抵消背隙并保证输出力平滑。
   - **C. Operational Modes**：阐述平行模式与主动自适应模式的机械切换；双传动链（蜗杆齿轮 + Idle-Stroke）在单次抓取周期中完成模式转换。

5. **IV. KINEMATIC ANALYSIS OF THE BIOCREST FINGER（第 4–5 页）**
   - 基于复矢量法建立平面平行四边形模型，给出指尖位置、速度与方向角公式，展示轨迹与速度随时间变化特性。
   - 表 I 总结符号定义，强调等速特性（|v| = L₁ω）及速度向量与连杆始终垂直的性质。

6. **V. GRASPING EXPERIMENTS OF THE BIOCREST GRIPPER（第 5 页）**
   - FDM 制造样机，采用双驱动电机与柔顺指节实现 5 mm 顺应；平行夹持保持指尖轨迹线性，适合精密搬运。
   - 通过笔、胶带卷、小音箱等测试对象验证双模式抓取的稳定性与几何自适应能力。

7. **VI. CONCLUSIONS（第 6 页）**
   - 总结 BioCrest 结构如何在单执行器框架下实现刚柔切换，避免复杂控制与传感器依赖。
   - 实验验证其兼顾工业精度与物流场景鲁棒性的潜力，强调成本效益与可靠性优势。

8. **REFERENCES（第 6 页）**
   - 列出支撑背景与相关工作：涵盖多模态抓取、双驱手、柔性夹爪、常力夹持与软硬混合手等最新文献。

---

> 本索引旨在快速定位《428.pdf》关键章节与贡献，便于阅读与引用。
