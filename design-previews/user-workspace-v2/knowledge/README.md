# 家居方位知识库

内容查看：[家居方位知识库](家居方位知识库.md)。结构化数据：[JSON](家居方位知识库.json)。两份内容均由线上数据库回读生成。

新增内容：[人物与事项居住象义](人物与事项居住象义.md) · [结构化数据](人物与事项居住象义.json)。首批为婚恋桃花4条、夫妻相处2条、考试学业3条、事业发展3条；逐条保存适用人物、方位、卦象、共住条件、时间与出处。

分析框架：[家居分析框架](framework/家居分析框架.md)。模块、资料结构及空模板位于 `framework/`，当前为本地结构设计，尚未接入线上分析。

2026-09-22 用户授权入库，使用 `0006_fengshui_knowledge.sql` 新增知识表及数据；随后按用户要求以 `0007_clean_knowledge_text.sql` 清理备注和正文中的整理用语。当前内容版本为 `1.1`。两次迁移均不更改网页、模型、账号或历史报告。

## 数据

- `fengshui_knowledge_sources`：14个来源；原有6个，人物事项新增8个讲义文字、学习笔记及整理页面。
- `fengshui_direction_correspondences`：8 组后天八卦方位、五行、家庭成员及身体取象，版本 `1.1`。
- `fengshui_knowledge_rules`：16 条缺角解读（每方位 1 条基础解读、1 条扩展候选）与 3 条缺角判定方法候选。
- `fengshui_rule_sources`：19 条规则与出处的关联。
- `fengshui_scenario_rules`：12条人物事项候选，独立保存，不替换缺角知识。
- `fengshui_scenario_rule_sources`：12条人物事项与出处的关联，保留章节定位。

缺角解读与阈值均为 `pending_review`、`enabled=0`。审核人与审核时间未记录时，数据库禁止启用规则。用户授权录入不等同于选定流派、阈值或启用自动判断。

人物事项同样为 `pending_review`、`enabled=0`。`0008_person_goal_knowledge.sql` 只追加知识表、出处与条目。核验记录：[人物事项入库核验](2026-09-22-person-goals-verification.json)。

人物事项按 `method_id → topic → 人物条件 → direction_code` 检索。`conditions_json` 保存关系阶段、目标、职业与角色条件；`actions_json` 保存来源支持的调整方向；`timing_json` 保存明确的时间信息。JSON `null` 表示没有确定内容，不生成默认入住时间。`evidence_type` 区分讲义文字、二次整理与个案讨论。

八宫基础对应与人物居住取卦分别处理；缺少人物角色时卦名保留空值。单身求姻缘与已婚关系冲突分开，出生信息、床头朝向和个案年龄均不从房间方位推断。

## 后续调用约定

按 `direction_code`（N、NE、E、SE、S、SW、W、NW）查询基础对应。实际家庭成员的匹配、卧室分配仍需独立规则；不得直接把长男、中男、少男换算成某个年龄或把符号角色自动绑定给具体住户。

未来报告调用应先确定判定方法、方向及适用条件，再读取经审核且已启用的解读，并在报告保存规则 ID、版本、来源与内容快照。本次仅完成数据存储，尚未接通报告调用，也未选择默认缺角标准。

```sql
SELECT direction_name, trigram, element, family_label, body_symbol, version
FROM fengshui_direction_correspondences
WHERE direction_code = 'NW';

SELECT r.id, r.title, r.content, r.conditions_json, r.version,
       s.title AS source_title, s.url AS source_url
FROM fengshui_knowledge_rules r
JOIN fengshui_rule_sources rs ON rs.rule_id = r.id
JOIN fengshui_knowledge_sources s ON s.id = rs.source_id
WHERE r.direction_code = 'NW'
  AND r.category = 'missing_corner_interpretation'
  AND r.review_status = 'approved' AND r.enabled = 1;
```

第二个查询在本批次录入后应返回空结果，这是未审核候选的正常状态。基础身体取象和传统解读不等于医学、财务或家庭事实判断。

## 应用与核验

目标为用户已指定的 `marsxiong19@gmail.com` 账户，数据库 `zhai-xu-workspace-auth`，ID `9bdeb598-8d98-4761-85cb-22dec53104c8`。先核对账户及待应用迁移列表，再用现有 Wrangler D1 迁移流程应用；应用后查询行数、来源关联、审核状态与外键完整性。不要在其他数据库重复录入或修改现有记录。
