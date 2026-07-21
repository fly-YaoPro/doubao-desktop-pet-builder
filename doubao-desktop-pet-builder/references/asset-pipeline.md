# 资产流水线

## 唯一母版规则

`core-ip` 是角色身份的唯一视觉真值。记录并锁定：轮廓、主色、五官、身体比例、标志配饰、材质和禁改项。

- 单图输入：用 `image_edit` 标准化上传图为 `core-ip`。
- 文字输入：只在创建 `core-ip` 时使用一次 `image_gen`。
- 所有动作：继续引用已确认 `core-ip`，使用 `image_edit`；提示词必须写明只改变动作/表情，不改变身份特征。
- 完整动作包：优先确定性修复，只有缺失或确认不合格的状态才补图。

模型输出使用与主体颜色反差明显的纯色不透明背景。不要请求模型直接输出透明 PNG，也不要依据肉眼或模型口述认定透明。

## 确定性处理

1. 从四角识别与角点连通的背景区域；只删除连通背景，不能把全图所有近白色像素直接设透明。
2. 主体接触画布边缘、角点被主体占据、背景与主体主色冲突或前景被大面积误删时直接失败返工。
3. 去除背景色边缘污染，检查真实 alpha 通道和透明像素比例。
4. 裁切前景并等比放入 512×512 透明画布，保留安全边距；锚点统一为底部中心。
5. 生成 JSON 报告和联系表。缺帧、边缘残留、主体触边、锚点漂移超限时 `qa:assets` 必须非零退出。

局部动作需要重画局部姿态，禁止旋转整张身体伪造摇尾巴、挥手等动作。

## 12 个默认状态

| ID | 用途 | 默认帧数 | 镜像 |
|---|---|---:|---|
| `idle` | 空闲基态 | 1–2 | 可按角色决定 |
| `blink` | 眨眼 | 1–2 | 通常安全 |
| `walk-left` | 向左移动 | 1–2 | 不默认镜像 |
| `walk-right` | 向右移动 | 1–2 | 不默认镜像 |
| `happy` | 点击/正反馈 | 1–2 | 通常安全 |
| `sleep` | 休息 | 1–2 | 按角色决定 |
| `typing` | 打字活动脉冲 | 1–2 | 通常安全 |
| `notify` | 提醒触发 | 1–2 | 通常安全 |
| `grab` | 文件拖入/拖拽 | 1–2 | 按角色决定 |
| `success` | 成功反馈 | 1–2 | 通常安全 |
| `fail` | 失败反馈 | 1–2 | 通常安全 |
| `peek` | 贴边探头 | 1–2 | 不默认镜像 |

文件名采用 `<state-id>.png` 或 `<state-id>-01.png`。`pet-spec.json` 的 `frames` 只写文件名。

## 可选扩展状态目录

现有样本的 38 个动作仅作为扩展词表，不强制生成：

`angry`、`blink`、`charging`、`chase-tail`、`click-mouse`、`curious`、`eat`、`eat-2`、`fail`、`grab`、`happy`、`heart`、`idle`、`idle-tail`、`jump`、`lick`、`low-battery`、`nod`、`notify`、`peek`、`pet`、`roll`、`run`、`run-2`、`sign`、`sleep`、`stretch`、`success`、`talking`、`thinking`、`typing`、`typing-2`、`walk-left`、`walk-left-2`、`walk-right`、`walk-right-2`、`wave`、`yawn`。

按交互需求增补，不要为了数量牺牲一致性或扩大首版范围。

## 橘猫回归夹具

`assets/regression-fixture/orange-cat` 只用于离线脚本、状态机和资产 QA 回归。生成用户工程时默认禁止复制；仅 `scaffold_project.py --use-regression-fixture` 可显式启用，并必须标记为测试工程。
