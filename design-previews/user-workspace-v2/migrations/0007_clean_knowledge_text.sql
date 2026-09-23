UPDATE fengshui_knowledge_sources SET note = ''
WHERE id IN ('shuogua-family','houtian-directions','shuogua-body','peiweng-corners','yinweixin-corners','longyu-corners');

UPDATE fengshui_direction_correspondences SET scope_note = '', version = '1.1'
WHERE direction_code IN ('N','NE','E','SE','S','SW','W','NW');

UPDATE fengshui_rule_sources SET note = ''
WHERE rule_id IN (
 'corner-NW-core','corner-SW-core','corner-E-core','corner-SE-core',
 'corner-N-core','corner-S-core','corner-NE-core','corner-W-core',
 'corner-NW-extended','corner-SW-extended','corner-E-extended','corner-SE-extended',
 'corner-N-extended','corner-S-extended','corner-NE-extended','corner-W-extended',
 'criterion-peiweng-grid','criterion-yinweixin-grid','criterion-longyu-grid'
);

UPDATE fengshui_knowledge_rules SET content = CASE id
 WHEN 'corner-NW-core' THEN '不利于父亲、男主人的事业发展、夫妻关系与健康。'
 WHEN 'corner-SW-core' THEN '不利于母亲、女主人的健康、夫妻相处与婚姻稳定。'
 WHEN 'corner-E-core' THEN '不利于长子的学习、成长与健康。'
 WHEN 'corner-SE-core' THEN '不利于长女的学习、成长与健康。'
 WHEN 'corner-N-core' THEN '中男学业与发展不顺，人际交往遇到阻碍。'
 WHEN 'corner-S-core' THEN '中女学习与发展不顺，关联家庭教育与礼仪。'
 WHEN 'corner-NE-core' THEN '不利于少男的成长、学业与健康。'
 WHEN 'corner-W-core' THEN '不利于少女的学习与健康。'
 WHEN 'corner-NW-extended' THEN '男主人经常不在家，事业动力不足，发展受阻。'
 WHEN 'corner-SW-extended' THEN '女主人在家感到委屈，工作发展受阻，夫妻感情不佳。'
 WHEN 'corner-E-extended' THEN '长子进取动力不足，事业行动力受限。'
 WHEN 'corner-SE-extended' THEN '长女婚恋与财运不顺。'
 WHEN 'corner-N-extended' THEN '中男谋划、感情生活与财富积累不顺。'
 WHEN 'corner-S-extended' THEN '社交不顺、声誉受损，精神状态欠佳。'
 WHEN 'corner-NE-extended' THEN '不利于子孙发展、家族传承与财产稳定。'
 WHEN 'corner-W-extended' THEN '沟通表达不畅，言语争执较多。'
 WHEN 'criterion-peiweng-grid' THEN '空缺面积超过所在方位方格的10%为缺角，超过20%为严重缺角。'
 WHEN 'criterion-yinweixin-grid' THEN '所在方位空缺四分之一为缺角。'
 WHEN 'criterion-longyu-grid' THEN '空缺面积超过所在方位总面积的三分之一为缺角。'
 END,
 title = CASE id
 WHEN 'corner-NW-extended' THEN '西北缺角：家庭参与与事业动力'
 WHEN 'corner-SW-extended' THEN '西南缺角：家庭感受与事业'
 WHEN 'corner-E-extended' THEN '正东缺角：行动力'
 WHEN 'corner-SE-extended' THEN '东南缺角：长女婚恋与财运'
 WHEN 'corner-N-extended' THEN '正北缺角：谋划与积累'
 WHEN 'corner-S-extended' THEN '正南缺角：社交与声誉'
 WHEN 'corner-NE-extended' THEN '东北缺角：传承与家业'
 WHEN 'corner-W-extended' THEN '正西缺角：沟通与口舌'
 WHEN 'criterion-peiweng-grid' THEN '九宫格判定：10%／20%'
 WHEN 'criterion-yinweixin-grid' THEN '九宫格判定：四分之一'
 WHEN 'criterion-longyu-grid' THEN '九宫格判定：三分之一'
 ELSE title END,
 version = '1.1'
WHERE id IN (
 'corner-NW-core','corner-SW-core','corner-E-core','corner-SE-core',
 'corner-N-core','corner-S-core','corner-NE-core','corner-W-core',
 'corner-NW-extended','corner-SW-extended','corner-E-extended','corner-SE-extended',
 'corner-N-extended','corner-S-extended','corner-NE-extended','corner-W-extended',
 'criterion-peiweng-grid','criterion-yinweixin-grid','criterion-longyu-grid'
);

UPDATE fengshui_knowledge_rules SET conditions_json = json_set(
 conditions_json,
 '$.subject', CASE direction_code
  WHEN 'NW' THEN '父亲、男主人' WHEN 'SW' THEN '母亲、女主人'
  WHEN 'E' THEN '长男' WHEN 'SE' THEN '长女'
  WHEN 'N' THEN '中男' WHEN 'S' THEN '中女'
  WHEN 'NE' THEN '少男' WHEN 'W' THEN '少女' END,
 '$.interpretation_type', '传统风水解读',
 '$.member_match_required', json('true')
)
WHERE id IN (
 'corner-NW-core','corner-SW-core','corner-E-core','corner-SE-core',
 'corner-N-core','corner-S-core','corner-NE-core','corner-W-core',
 'corner-NW-extended','corner-SW-extended','corner-E-extended','corner-SE-extended',
 'corner-N-extended','corner-S-extended','corner-NE-extended','corner-W-extended'
);

UPDATE fengshui_knowledge_rules SET conditions_json = json_set(
 conditions_json, '$.boundary_policy', '封闭阳台计入，未封闭阳台不计入；九宫格内的公共电梯或楼梯按缺角处理'
)
WHERE id = 'criterion-yinweixin-grid';
