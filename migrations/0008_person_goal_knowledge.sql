-- Additive traditional person-goal-room knowledge. No runtime integration.
CREATE TABLE fengshui_scenario_rules (
 id TEXT PRIMARY KEY,
 topic TEXT NOT NULL CHECK(topic IN ('romance','marriage','exams','career')),
 method_id TEXT NOT NULL,
 title TEXT NOT NULL,
 subject_label TEXT NOT NULL,
 direction_code TEXT NOT NULL REFERENCES fengshui_direction_correspondences(direction_code),
 person_trigram TEXT CHECK(person_trigram IN ('乾','坤','震','巽','坎','离','艮','兑')),
 hexagram_name TEXT,
 content TEXT NOT NULL,
 conditions_json TEXT NOT NULL CHECK(json_valid(conditions_json) AND json_type(conditions_json)='object'),
 actions_json TEXT NOT NULL CHECK(json_valid(actions_json) AND json_type(actions_json) IN ('object','null')),
 timing_json TEXT NOT NULL CHECK(json_valid(timing_json) AND json_type(timing_json) IN ('object','null')),
 evidence_type TEXT NOT NULL CHECK(evidence_type IN ('lecture_transcript','secondary_summary','case_discussion')),
 interpretation_type TEXT NOT NULL DEFAULT 'traditional_symbolism' CHECK(interpretation_type='traditional_symbolism'),
 review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK(review_status IN ('pending_review','approved','rejected')),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 version TEXT NOT NULL DEFAULT '1.0',
 recorded_at TEXT NOT NULL DEFAULT '2026-09-22',
 reviewed_at TEXT,
 reviewed_by TEXT,
 CHECK((person_trigram IS NULL AND hexagram_name IS NULL) OR (person_trigram IS NOT NULL AND hexagram_name IS NOT NULL)),
 CHECK(enabled=0 OR (review_status='approved' AND length(trim(coalesce(reviewed_at,'')))>0 AND length(trim(coalesce(reviewed_by,'')))>0)),
 CHECK(review_status!='approved' OR (length(trim(coalesce(reviewed_at,'')))>0 AND length(trim(coalesce(reviewed_by,'')))>0))
);
CREATE INDEX fengshui_scenarios_lookup ON fengshui_scenario_rules(method_id,topic,direction_code,review_status,enabled);
CREATE TABLE fengshui_scenario_rule_sources (
 rule_id TEXT NOT NULL REFERENCES fengshui_scenario_rules(id),
 source_id TEXT NOT NULL REFERENCES fengshui_knowledge_sources(id),
 locator TEXT NOT NULL,
 PRIMARY KEY(rule_id,source_id)
);


INSERT INTO fengshui_knowledge_sources(id,title,author,url,source_type,recorded_at,note) VALUES ('tianji-09-1','天纪文字版09-1','倪海厦讲述；神机阁墨谷先生刊载','https://www.shenjige.cn/details/w8iYJrm6n.html','practitioner_article','2026-09-22','');

INSERT INTO fengshui_knowledge_sources(id,title,author,url,source_type,recorded_at,note) VALUES ('tianji-08-5','天纪文字版08-5','倪海厦讲述；神机阁墨谷先生刊载','https://www.shenjige.cn/details/0DhkwMhCM.html','practitioner_article','2026-09-22','');

INSERT INTO fengshui_knowledge_sources(id,title,author,url,source_type,recorded_at,note) VALUES ('tianji-09-3','天纪文字版09-3','倪海厦讲述；神机阁文字整理','https://www.shenjige.cn/details/O4GmiZ1-A.html','practitioner_article','2026-09-22','');

INSERT INTO fengshui_knowledge_sources(id,title,author,url,source_type,recorded_at,note) VALUES ('tianji-heng','雷风恒：风水阳宅应用','小天书屋整理；标注来源为倪海厦《天纪》','https://www.wangcai.club/zh/books/yijing/03-gua/32-heng','practitioner_article','2026-09-22','');

INSERT INTO fengshui_knowledge_sources(id,title,author,url,source_type,recorded_at,note) VALUES ('tianji-gou','天风姤：风水阳宅应用','小天书屋整理；标注来源为倪海厦《天纪》','https://www.wangcai.club/zh/books/yijing/03-gua/44-gou','practitioner_article','2026-09-22','');

INSERT INTO fengshui_knowledge_sources(id,title,author,url,source_type,recorded_at,note) VALUES ('tianji-66','倪海厦天纪66：艮为山、风山渐、雷泽归妹卦详解','倪海厦讲述；太极之巅易学网转载','https://www.taijizhidian.com/zzsb/69662.html','practitioner_article','2026-09-22','');

INSERT INTO fengshui_knowledge_sources(id,title,author,url,source_type,recorded_at,note) VALUES ('tianji-qian','乾为天：天纪易经学习笔记','倪海厦讲述；LazyHub知识栏目整理','https://wx.lazyhub.cn/index.php?card=1&mode=yijing','practitioner_article','2026-09-22','');

INSERT INTO fengshui_knowledge_sources(id,title,author,url,source_type,recorded_at,note) VALUES ('tianji-xian','泽山咸：天纪易经学习笔记','倪海厦讲述；LazyHub知识栏目整理','https://wx.lazyhub.cn/index.php?card=31&mode=yijing','practitioner_article','2026-09-22','');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('romance-woman-SE','romance','tianji_person_room_v1','单身女性：东南婚缘取用','当前单身、希望建立伴侣关系的成年女性','SE',NULL,NULL,'东南取婚缘启动、重新建立伴侣关系之象，包含离异或丧偶后希望再婚的情境。','{"adult_only":true,"relationship_status":["never_married","divorced","widowed"],"current_partner":false,"goal":["seek_partner","repartner"],"requires":["confirmed_relationship_status","selected_timing_method","individual_timing_review"],"role_codes":[],"excludes":["seeking_extramarital_relationship"],"scope":"source_discussion_with_case"}','{"kind":"candidate_room_direction","direction_code":"SE","sharing":null}','{"kind":"individual_timing","lead_months":null,"start_date":null,"deadline":null,"case_ages_are_general_rule":false}','case_discussion','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('romance-woman-SE','tianji-09-1','女性红鸾取用段及由西南改住东南的个案');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('romance-mother-SW','romance','tianji_person_room_v1','单身母亲：西南与婚恋目标','以母亲身份取象、独居且希望再婚的成年女性','SW','坤','坤为地','西南独居取独处、婚缘推进偏缓之象；事业安排与求伴侣的取用分开处理。','{"adult_only":true,"role_codes":["母"],"relationship_status":["divorced","widowed","never_married"],"current_partner":false,"sharing":"alone","goal":["repartner"],"requires":["confirmed_role","confirmed_occupancy"],"scope":"source_discussion_with_case"}','null','null','case_discussion','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('romance-mother-SW','tianji-09-1','母亲名位、西南独住及后续婚缘安排段');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('romance-youngest-daughter-NE','romance','tianji_person_room_v1','少女角色：东北媒介婚缘','已成年、未婚且角色确认为少女的家庭成员','NE','兑','泽山咸','婚缘取媒介介绍之象，同时包含关系先成后变的解读；与自由交往型桃花分开归类。','{"adult_only":true,"role_codes":["少女"],"relationship_status":["never_married"],"goal":["seek_partner"],"requires":["confirmed_role","confirmed_relationship_status"],"mixed_interpretation":true}','null','null','secondary_summary','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('romance-youngest-daughter-NE','tianji-xian','PDF第185页／页内184：阳宅象解');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('romance-eldest-daughter-NE','romance','tianji_person_room_v1','长女：东北婚恋取用','已成年、未婚且角色确认为长女的家庭成员','NE','巽','风山渐','婚恋取推进迟缓、关系难以落实之象；同一组合在公职事业主题下另有不同解读。','{"adult_only":true,"role_codes":["长女"],"relationship_status":["never_married"],"goal":["seek_partner","marry"],"requires":["confirmed_role","confirmed_relationship_status"],"related_rule_ids":["career-eldest-daughter-NE"]}','null','null','lecture_transcript','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('romance-eldest-daughter-NE','tianji-66','风山渐（阳宅）第三至第五项');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('marriage-couple-NW','marriage','tianji_person_room_v1','夫妻同住：西北主卧','已婚夫妻共同居住；以妻子角色为本条主体','NW','坤','地天泰','妻居夫位，取夫妻和合、共同生活之象；丈夫在同一房间另取乾为天。','{"adult_only":true,"role_codes":["母"],"relationship_status":["married"],"sharing":"with_spouse","goal":["marital_harmony"],"requires":["confirmed_spouse_relationship","confirmed_sharing_room"],"co_resident_trigram":"乾","co_resident_hexagram":"乾为天"}','{"kind":"candidate_shared_bedroom","direction_code":"NW","sharing":"with_spouse"}','null','lecture_transcript','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('marriage-couple-NW','tianji-08-5','阳宅上面：妻居西北、与夫同住段');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('marriage-husband-SE','marriage','tianji_person_room_v1','丈夫：东南异性缘与夫妻关系','已婚、以丈夫角色取象的男性','SE','乾','天风姤','取外缘增多、夫妻关系受扰之象，归入婚姻冲突主题，不列为求伴侣的优选房间。','{"adult_only":true,"role_codes":["父"],"relationship_status":["married"],"goal":["marital_harmony","relationship_conflict_review"],"requires":["confirmed_role","confirmed_relationship_status"],"romance_kind":"marital_conflict","placement_recommendation":false}','null','null','secondary_summary','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('marriage-husband-SE','tianji-gou','第七节：父母住东南、夫妻失和段');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('exams-husband-S','exams','tianji_person_room_v1','丈夫备考：正南','已婚、以丈夫或父亲角色取象的男性','S','乾','天火同人','正南取科甲、资格考试之象。该讲法将备考本人暂住与夫妻共同迁居分开。','{"adult_only":true,"role_codes":["父"],"relationship_status":["married"],"goal":["exam","professional_qualification"],"requires":["confirmed_role","confirmed_exam_date","temporary_occupancy_agreement"],"sharing":"exam_candidate_only","desk_orientation_method":"separate_personal_study_method"}','{"kind":"temporary_room_direction","direction_code":"S","sharing":"exam_candidate_only"}','{"kind":"approximate_lead_before_event","event":"exam_date","lead_months":3,"approximate":true,"stay_duration_months":null,"guaranteed_effect_date":null}','lecture_transcript','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('exams-husband-S','tianji-09-3','阳宅部分：父居二女位、司法官考试、提前一季入住段');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('exams-eldest-son-SE','exams','tianji_person_room_v1','长子备考：东南','角色确认为长男的备考成员','SE','震','雷风恒','东南取学习、考试与资格考核之象。与丈夫备考的天火同人分开检索。','{"role_codes":["长男"],"goal":["exam","professional_qualification"],"requires":["confirmed_role"],"reassess_role_when":["marriage","parenthood"],"not_inherited_from_rule":"exams-husband-S"}','{"kind":"candidate_room_direction","direction_code":"SE","sharing":null}','null','secondary_summary','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('exams-eldest-son-SE','tianji-heng','第七节：长子居长女位、科甲与执照考试段');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('exams-youngest-son-NE','exams','tianji_person_room_v1','少男学习：东北','角色确认为少男的家庭成员','NE','艮','艮为山','少男居少男位，取学业、科甲之象。','{"role_codes":["少男"],"goal":["study","exam"],"requires":["confirmed_role"],"role_is_not_age_band":true}','{"kind":"candidate_room_direction","direction_code":"NE","sharing":null}','null','lecture_transcript','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('exams-youngest-son-NE','tianji-66','艮为山（阳宅）：三子居三子位、科甲段');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('career-husband-NW','career','tianji_person_room_v1','丈夫或父亲：西北事业取用','已婚丈夫，或与子女同住且角色确认为父亲的男性','NW','乾','乾为天','西北取事业担当、决断与家庭责任之象；公务任职和经营管理分别记录职业背景。','{"adult_only":true,"role_codes":["父"],"goal":["career","business_management"],"any_of":[{"relationship_status":"married"},{"confirmed_parent_role":true,"lives_with_children":true}],"requires":["confirmed_role","confirmed_occupation"],"married_working_away_allowed":true}','{"kind":"candidate_room_direction","direction_code":"NW","sharing":null}','null','secondary_summary','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('career-husband-NW','tianji-qian','PDF第22—23页：阳宅象解及乾为天的前提条件');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('career-husband-S','career','tianji_person_room_v1','丈夫公职：正南晋升取用','已婚且从事公职的男性','S','乾','天火同人','正南在公职情境中取晋升之象；私人企业不直接套用同一晋升解释。','{"adult_only":true,"role_codes":["父"],"relationship_status":["married"],"occupation":["public_service"],"goal":["promotion"],"requires":["confirmed_role","confirmed_occupation"],"excludes_occupation":["private_company"],"sharing":"not_generalized_to_couple","related_rule_ids":["exams-husband-S"]}','null','null','lecture_transcript','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('career-husband-S','tianji-09-3','天火同人：文武公职与私人企业区别段');

INSERT INTO fengshui_scenario_rules(id,topic,method_id,title,subject_label,direction_code,person_trigram,hexagram_name,content,conditions_json,actions_json,timing_json,evidence_type,interpretation_type,review_status,enabled,version,recorded_at,reviewed_at,reviewed_by) VALUES ('career-eldest-daughter-NE','career','tianji_person_room_v1','长女公职：东北职业取用','角色确认为长女、从事公职或教学工作的成年成员','NE','巽','风山渐','东北在公务、教职情境中取职业发展之象；学业和婚恋主题须另行判断。','{"adult_only":true,"role_codes":["长女"],"occupation":["public_service","teacher"],"goal":["career"],"requires":["confirmed_role","confirmed_occupation"],"mixed_interpretation":true,"related_rule_ids":["romance-eldest-daughter-NE"]}','null','null','lecture_transcript','traditional_symbolism','pending_review',0,'1.0','2026-09-22',NULL,NULL);

INSERT INTO fengshui_scenario_rule_sources(rule_id,source_id,locator) VALUES ('career-eldest-daughter-NE','tianji-66','风山渐（阳宅）：公职、教员段');
