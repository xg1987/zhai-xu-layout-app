-- Browsable classification of practitioner case material.
-- Categories describe what was recorded; they do not alter report logic.
CREATE TABLE fengshui_case_category_catalog (
  code TEXT PRIMARY KEY,
  group_code TEXT NOT NULL,
  group_label TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE (group_code,label)
);

CREATE TABLE fengshui_case_category_links (
  case_item_id TEXT NOT NULL REFERENCES fengshui_case_items(id),
  category_code TEXT NOT NULL REFERENCES fengshui_case_category_catalog(code),
  PRIMARY KEY (case_item_id,category_code)
);
CREATE INDEX fengshui_case_category_links_category
  ON fengshui_case_category_links(category_code,case_item_id);

INSERT INTO fengshui_case_category_catalog(code,group_code,group_label,label,sort_order) VALUES
 ('missing_corner','layout','户型与方位','补角',10),
 ('water_layout','elements','水火处理','水局与水系',20),
 ('fire_layout','elements','水火处理','火局',21),
 ('room_assignment','residents','居住安排','换房与居住房间',30),
 ('bed_direction','residents','居住安排','床位与睡向',31),
 ('door_opposition','openings','门窗与入口','门对门与门冲',40),
 ('curtain','openings','门窗与入口','门帘与窗帘',41),
 ('entry_layout','openings','门窗与入口','入户门与玄关',42),
 ('mat_coins','openings','门窗与入口','地垫与垫下布置',43),
 ('window_balcony','openings','门窗与入口','窗台与阳台',44),
 ('wealth_layout','topics','专题布局','财局',50),
 ('romance_layout','topics','专题布局','桃花局',51),
 ('study_layout','topics','专题布局','文昌与学业',52),
 ('career_layout','topics','专题布局','事业局',53),
 ('marriage_layout','topics','专题布局','婚姻和合局',54),
 ('gourd','objects','植物与摆件','葫芦',60),
 ('plants','objects','植物与摆件','绿植与花木',61),
 ('taishan_stone','objects','植物与摆件','泰山石',62),
 ('ruler_coins','objects','植物与摆件','五帝尺与铜钱',63),
 ('ornaments','objects','植物与摆件','其他摆件与符物',64),
 ('color_textile','objects','植物与摆件','颜色与软装',65),
 ('outdoor','environment','庭院与环境','庭院与室外',70),
 ('furniture_move','environment','庭院与环境','家具设备调整',71),
 ('clutter_repair','environment','庭院与环境','整理与修缮',72),
 ('health_lifestyle','other','其他记录','健康与生活原话',80),
 ('bathroom_general','other','其他记录','卫生间一般处理',81),
 ('direction_layout','other','其他记录','方位一般布局',82),
 ('other','other','其他记录','其他家居处理',83);
