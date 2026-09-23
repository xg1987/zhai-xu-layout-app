-- Reference knowledge only. This migration does not change plans, accounts,
-- model settings or the report algorithm. Candidate interpretations are disabled.
CREATE TABLE fengshui_knowledge_sources (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 author TEXT NOT NULL,
 url TEXT NOT NULL UNIQUE,
 source_type TEXT NOT NULL CHECK(source_type IN ('classical_text','practitioner_article')),
 recorded_at TEXT NOT NULL DEFAULT '2026-09-22',
 note TEXT NOT NULL
);

CREATE TABLE fengshui_direction_correspondences (
 direction_code TEXT PRIMARY KEY CHECK(direction_code IN ('N','NE','E','SE','S','SW','W','NW')),
 direction_name TEXT NOT NULL UNIQUE,
 trigram TEXT NOT NULL UNIQUE,
 element TEXT NOT NULL CHECK(element IN ('木','火','土','金','水')),
 family_role TEXT NOT NULL,
 family_label TEXT NOT NULL,
 body_symbol TEXT NOT NULL,
 family_source_id TEXT NOT NULL REFERENCES fengshui_knowledge_sources(id),
 direction_source_id TEXT NOT NULL REFERENCES fengshui_knowledge_sources(id),
 body_source_id TEXT NOT NULL REFERENCES fengshui_knowledge_sources(id),
 version TEXT NOT NULL DEFAULT '1.0',
 recorded_at TEXT NOT NULL DEFAULT '2026-09-22',
 scope_note TEXT NOT NULL DEFAULT '后天八卦的传统象征对应。家庭成员的实际匹配另行确认；不由称谓推定年龄、婚姻身份或卧室安排，身体取象不是疾病判断。'
);

CREATE TABLE fengshui_knowledge_rules (
 id TEXT PRIMARY KEY,
 category TEXT NOT NULL CHECK(category IN ('missing_corner_interpretation','missing_corner_criterion')),
 direction_code TEXT REFERENCES fengshui_direction_correspondences(direction_code),
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 conditions_json TEXT NOT NULL CHECK(json_valid(conditions_json)),
 review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK(review_status IN ('pending_review','approved','rejected')),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 version TEXT NOT NULL DEFAULT '1.0',
 recorded_at TEXT NOT NULL DEFAULT '2026-09-22',
 reviewed_at TEXT,
 reviewed_by TEXT,
 CHECK((category='missing_corner_interpretation' AND direction_code IS NOT NULL) OR
       (category='missing_corner_criterion' AND direction_code IS NULL)),
 CHECK(enabled=0 OR (review_status='approved' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)),
 CHECK(review_status!='approved' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
CREATE INDEX fengshui_rules_direction ON fengshui_knowledge_rules(direction_code,category,review_status,enabled);

CREATE TABLE fengshui_rule_sources (
 rule_id TEXT NOT NULL REFERENCES fengshui_knowledge_rules(id),
 source_id TEXT NOT NULL REFERENCES fengshui_knowledge_sources(id),
 note TEXT NOT NULL,
 PRIMARY KEY(rule_id,source_id)
);

INSERT INTO fengshui_knowledge_sources(id,title,author,url,source_type,note) VALUES
 ('shuogua-family','《说卦传》乾坤六子家庭取象（台湾大学开放课程讲义引文）','《周易·说卦传》；台湾大学开放式课程','https://ocw.aca.ntu.edu.tw/uploads/course_item_file/file/758/103S201_AA13L01.pdf','classical_text','用于父、母、长男、长女、中男、中女、少男、少女的基础对应，不作为缺角后果依据。'),
 ('houtian-directions','《御纂周易折中》后天八卦方位与五行','《御纂周易折中》；中国哲学书电子化计划','https://ctext.org/wiki.pl?chapter=552170&if=gb','classical_text','用于八方、卦象和五行对应，不作为缺角后果依据。'),
 ('shuogua-body','《周易正义》说卦卷九之九：八卦人身取象','孔颖达疏；维基文库','https://zh.wikisource.org/zh-hans/周易正義/09.09','classical_text','乾首、坤腹、震足、巽股、坎耳、离目、艮手、兑口。仅记录传统象征，不扩展为具体疾病预测。'),
 ('peiweng-corners','你买的房屋缺角吗？房屋缺角的危害','广州市裴翁易文化发展有限公司网站','https://www.peiwengfengshui.com/page101.html?article_id=1586','practitioner_article','仅摘记并转述该网站的传统论法；不是经过验证的因果结论。阈值与其他来源有分歧，须独立审核。'),
 ('yinweixin-corners','户型缺角影响家人','银维新；加拿大国际风水命理研究中心刊载，2024-03-29','https://www.cafengshuinet.com/m/show_detail.php?id=3756','practitioner_article','仅转述与本次审核有关的传统解读；不录入疾病、死亡、生育结果等确定预测，也不把不同作者解释合为统一标准。'),
 ('longyu-corners','新加坡 HDB 常见格局：房屋缺角如何化解？','陈巃羽三元纳气风水网站','https://longyu.helplook.com/docs/qhKwbtmr','practitioner_article','本文将坊间论法与作者观点分栏。这里引用其坊间论法整理，不等同于作者认可必然发生，也不是科学因果证据。');

INSERT INTO fengshui_direction_correspondences(direction_code,direction_name,trigram,element,family_role,family_label,body_symbol,family_source_id,direction_source_id,body_source_id) VALUES
 ('N','正北','坎','水','中男','中男','耳部','shuogua-family','houtian-directions','shuogua-body'),
 ('NE','东北','艮','土','少男','少男、小儿子','手部','shuogua-family','houtian-directions','shuogua-body'),
 ('E','正东','震','木','长男','长男、大儿子','足部','shuogua-family','houtian-directions','shuogua-body'),
 ('SE','东南','巽','木','长女','长女、大女儿','股（大腿）','shuogua-family','houtian-directions','shuogua-body'),
 ('S','正南','离','火','中女','中女','眼睛','shuogua-family','houtian-directions','shuogua-body'),
 ('SW','西南','坤','土','母','母亲、女主人','腹部','shuogua-family','houtian-directions','shuogua-body'),
 ('W','正西','兑','金','少女','少女、小女儿','口部','shuogua-family','houtian-directions','shuogua-body'),
 ('NW','西北','乾','金','父','父亲、男主人','头部','shuogua-family','houtian-directions','shuogua-body');

-- Core and extended interpretations remain separate, with a single named source
-- for each item. No trigger is executable until a detection method is agreed.
INSERT INTO fengshui_knowledge_rules(id,category,direction_code,title,content,conditions_json) VALUES
 ('corner-NW-core','missing_corner_interpretation','NW','西北缺角：男主人事业与家庭','该传统论法将西北缺角解读为父亲、男主人的事业推进不顺，并关联夫妻相处及身体状态。','{"trigger":"已按选定方法确认西北缺角","subject":"父亲、男主人；需匹配实际家庭成员","topics":["事业","夫妻关系","传统身体说法"],"detection_method":null,"severity":null,"requires_review":true,"interpretation_type":"传统风水解读，非事实预测"}'),
 ('corner-SW-core','missing_corner_interpretation','SW','西南缺角：女主人与婚姻关系','该传统论法将西南缺角关联母亲、女主人的身体状态，以及夫妻相处和婚姻稳定。','{"trigger":"已按选定方法确认西南缺角","subject":"母亲、女主人；需匹配实际家庭成员","topics":["夫妻关系","传统身体说法"],"detection_method":null,"severity":null,"requires_review":true,"interpretation_type":"传统风水解读，非事实预测"}'),
 ('corner-E-core','missing_corner_interpretation','E','正东缺角：长子的学习与成长','该传统论法将正东缺角解释为长子的学习、成长和身体状态受到不利影响。','{"trigger":"已按选定方法确认正东缺角","subject":"长男；需匹配实际家庭成员","topics":["学业","成长","传统身体说法"],"detection_method":null,"severity":null,"requires_review":true,"interpretation_type":"传统风水解读，非事实预测"}'),
 ('corner-SE-core','missing_corner_interpretation','SE','东南缺角：长女的学习与成长','该传统论法将东南缺角解释为长女的学习、成长和身体状态受到不利影响。','{"trigger":"已按选定方法确认东南缺角","subject":"长女；需匹配实际家庭成员","topics":["学业","成长","传统身体说法"],"detection_method":null,"severity":null,"requires_review":true,"interpretation_type":"传统风水解读，非事实预测"}'),
 ('corner-N-core','missing_corner_interpretation','N','正北缺角：中男的学业与发展','该传统论法将正北缺角关联中男的学业、发展不顺及人际阻碍。','{"trigger":"已按选定方法确认正北缺角","subject":"中男；家庭中如何对应需另行确认","topics":["学业","发展","人际"],"detection_method":null,"severity":null,"requires_review":true,"interpretation_type":"传统风水解读，非事实预测"}'),
 ('corner-S-core','missing_corner_interpretation','S','正南缺角：中女的学习与发展','该传统论法将正南缺角关联中女的学习和发展不顺，并延伸到家庭教育与礼仪。','{"trigger":"已按选定方法确认正南缺角","subject":"中女；家庭中如何对应需另行确认","topics":["学业","发展","家庭教育"],"detection_method":null,"severity":null,"requires_review":true,"interpretation_type":"传统风水解读，非事实预测"}'),
 ('corner-NE-core','missing_corner_interpretation','NE','东北缺角：少男的成长与学业','该传统论法将东北缺角解释为少男的成长、学业和身体状态受到不利影响。','{"trigger":"已按选定方法确认东北缺角","subject":"少男；需匹配实际家庭成员","topics":["学业","成长","传统身体说法"],"detection_method":null,"severity":null,"requires_review":true,"interpretation_type":"传统风水解读，非事实预测"}'),
 ('corner-W-core','missing_corner_interpretation','W','正西缺角：少女的学习与成长','该传统论法将正西缺角关联少女的学习和身体状态，具体年龄范围不在本条确定。','{"trigger":"已按选定方法确认正西缺角","subject":"少女；需匹配实际家庭成员","topics":["学业","成长","传统身体说法"],"detection_method":null,"severity":null,"requires_review":true,"interpretation_type":"传统风水解读，非事实预测"}'),
 ('corner-NW-extended','missing_corner_interpretation','NW','西北缺角：家庭参与与事业动力的扩展说法','部分作者进一步把西北缺角联系到男主人经常不在家、事业动力不足或发展受阻；这些是该作者的扩展解读，不可自动套用。','{"trigger":"已确认西北缺角且明确选择此条来源","subject":"父亲、男主人；需匹配实际家庭成员","topics":["家庭参与","事业动力"],"requires_review":true,"interpretation_type":"单一来源扩展说法，非事实预测"}'),
 ('corner-SW-extended','missing_corner_interpretation','SW','西南缺角：家庭感受与事业的扩展说法','部分作者将西南缺角延伸为女主人在家庭中感到委屈、工作发展受阻及夫妻感情不佳；不可据此断定家庭实际状况。','{"trigger":"已确认西南缺角且明确选择此条来源","subject":"母亲、女主人；需匹配实际家庭成员","topics":["家庭感受","事业","夫妻关系"],"requires_review":true,"interpretation_type":"单一来源扩展说法，非事实预测"}'),
 ('corner-E-extended','missing_corner_interpretation','E','正东缺角：行动力的扩展说法','该资料整理的坊间论法把正东缺角关联长子的进取动力不足，以及事业行动力受限。','{"trigger":"已确认正东缺角且明确选择此条来源","subject":"长男；需匹配实际家庭成员","topics":["行动力","事业"],"requires_review":true,"interpretation_type":"坊间论法汇编，非事实预测"}'),
 ('corner-SE-extended','missing_corner_interpretation','SE','东南缺角：长女婚恋与财运的扩展说法','部分作者把东南缺角进一步关联长女的婚恋与财运不顺；这是扩展解读，不等于婚姻或收入事实。','{"trigger":"已确认东南缺角且明确选择此条来源","subject":"长女；需匹配实际家庭成员","topics":["婚恋","财运"],"requires_review":true,"interpretation_type":"单一来源扩展说法，非事实预测"}'),
 ('corner-N-extended','missing_corner_interpretation','N','正北缺角：谋划与积累的扩展说法','该资料整理的坊间论法把正北缺角关联中男的谋划、感情生活及财富积累不顺。','{"trigger":"已确认正北缺角且明确选择此条来源","subject":"中男；家庭中如何对应需另行确认","topics":["谋划","感情","财富积累"],"requires_review":true,"interpretation_type":"坊间论法汇编，非事实预测"}'),
 ('corner-S-extended','missing_corner_interpretation','S','正南缺角：社交与声誉的扩展说法','该资料整理的坊间论法把正南缺角联系到社交、声誉及精神状态方面的不利表现。','{"trigger":"已确认正南缺角且明确选择此条来源","subject":"中女；家庭中如何对应需另行确认","topics":["社交","声誉","精神状态取象"],"requires_review":true,"interpretation_type":"坊间论法汇编，非事实预测"}'),
 ('corner-NE-extended','missing_corner_interpretation','NE','东北缺角：传承与家业的扩展说法','该资料整理的坊间论法把东北缺角延伸到子孙发展、家族传承和财产稳定等主题。','{"trigger":"已确认东北缺角且明确选择此条来源","subject":"少男及家族传承主题；不得推定具体生育或继承结果","topics":["子孙发展","传承","家业积累"],"requires_review":true,"interpretation_type":"坊间论法汇编，非事实预测"}'),
 ('corner-W-extended','missing_corner_interpretation','W','正西缺角：沟通与口舌的扩展说法','部分作者把正西缺角进一步解释为沟通表达不畅、言语争执较多。','{"trigger":"已确认正西缺角且明确选择此条来源","subject":"少女及家庭沟通主题；需核对具体适用对象","topics":["表达","人际","口舌"],"requires_review":true,"interpretation_type":"单一来源扩展说法，非事实预测"}'),
 ('criterion-peiweng-grid','missing_corner_criterion',NULL,'九宫格缺角阈值候选：10%／20%','裴翁网站列出的九宫格法以超过所在方格面积的10%判断缺角，超过20%判断严重缺角。仅保存该来源标准，尚未选用。','{"method":"九宫格","denominator":"所在方位方格面积","missing":{"numerator":1,"denominator":10,"comparison":"gt"},"severe":{"numerator":1,"denominator":5,"comparison":"gt"},"boundary_policy":null,"direction_alignment":null,"requires_review":true,"executable":false}'),
 ('criterion-yinweixin-grid','missing_corner_criterion',NULL,'九宫格缺角阈值候选：四分之一','银维新的文章以所在方位缺少四分之一判断缺角；原文没有清楚区分等于与超过，不能自行补成运算条件。','{"method":"九宫格","denominator":"所在方位方格面积","missing":{"numerator":1,"denominator":4,"comparison":null},"severe":null,"boundary_policy":"原文封闭阳台计入、未封闭不计入；九宫格内公共电梯或楼梯按缺角处理，均待审核","direction_alignment":null,"requires_review":true,"executable":false}'),
 ('criterion-longyu-grid','missing_corner_criterion',NULL,'九宫格缺角阈值候选：三分之一','陈巃羽网站的坊间论法部分，将所在方位空缺超过三分之一视为缺角；该文也提醒不能据缺角直接断定具体后果。','{"method":"九宫格","denominator":"所在方位总面积","missing":{"numerator":1,"denominator":3,"comparison":"gt"},"severe":null,"boundary_policy":null,"direction_alignment":null,"requires_review":true,"executable":false}');

INSERT INTO fengshui_rule_sources(rule_id,source_id,note)
 SELECT id,'peiweng-corners','转述文章中的该方位段落，未采纳确定的疾病、灾难或化解效果承诺。'
 FROM fengshui_knowledge_rules WHERE id IN ('corner-NW-core','corner-SW-core','corner-E-core','corner-SE-core','corner-N-core','corner-S-core','corner-NE-core','corner-W-core');
INSERT INTO fengshui_rule_sources(rule_id,source_id,note)
 SELECT id,'yinweixin-corners','保留为单一来源的扩展候选，与基础对应及其他流派分开。'
 FROM fengshui_knowledge_rules WHERE id IN ('corner-NW-extended','corner-SW-extended','corner-SE-extended','corner-W-extended');
INSERT INTO fengshui_rule_sources(rule_id,source_id,note)
 SELECT id,'longyu-corners','转述文章中的坊间论法表格，不代表作者认定这些后果必然发生。'
 FROM fengshui_knowledge_rules WHERE id IN ('corner-E-extended','corner-N-extended','corner-S-extended','corner-NE-extended');
INSERT INTO fengshui_rule_sources(rule_id,source_id,note) VALUES
 ('criterion-peiweng-grid','peiweng-corners','仅记录九宫格法；该文另有中心点法，不与之混用。'),
 ('criterion-yinweixin-grid','yinweixin-corners','原文未明确四分之一临界值的比较方式，保留未知。'),
 ('criterion-longyu-grid','longyu-corners','引用坊间论法部分，尚未选择为项目计算标准。');
