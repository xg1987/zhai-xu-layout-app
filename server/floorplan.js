import Anthropic from '@anthropic-ai/sdk'

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const MAX_IMAGE_BASE64_LENGTH = 14 * 1024 * 1024

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'points'],
  properties: {
    summary: {
      type: 'string',
      description: '对整个户型的总体分析：朝向、格局优缺点、最需要处理的问题，120字以内。',
    },
    points: {
      type: 'array',
      description: '按重要程度排序的3-6个重点调整点位。',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sector', 'place', 'short', 'advice', 'schedule', 'warning', 'status', 'x', 'y'],
        properties: {
          sector: { type: 'string', description: '点位所在方位，如：西北、中宫、北偏西' },
          place: { type: 'string', description: '点位对应的空间名称，如：入户玄关、主卧、厨房' },
          short: { type: 'string', description: '布置方案的简称，8字以内，如：泰山石 · 水局' },
          advice: { type: 'string', description: '该点位的问题与具体布置建议，一到两句话' },
          schedule: { type: 'string', description: '建议的实施时机，如：铺地施工前完成、软装进场后完成' },
          warning: { type: 'string', description: '待确认事项，以"待确认："开头' },
          status: { type: 'string', description: '当前状态，5字以内，如：待定做法' },
          x: { type: 'number', description: '点位在图片上的横向位置，0-100 百分比，0为最左' },
          y: { type: 'number', description: '点位在图片上的纵向位置，0-100 百分比，0为最上' },
        },
      },
    },
  },
}

const SYSTEM_PROMPT = [
  '你是宅序 App 的 AI 布局助手。用户会上传住宅户型图，你负责从家居风水与空间布局角度分析这张图，',
  '找出最需要调整的位置，并给出可以落地施工的布置建议（如水局、土局、泰山石、铜币布局、绿植、挂画等）。',
  '建议必须贴合图中实际空间，坐标要准确落在对应房间或区域上。',
].join('')

const USER_PROMPT = [
  '请分析这张户型图：',
  '1. 先识别整体格局：入户门、客厅、卧室、厨房、卫生间、楼梯/电梯等位置，以及可判断的朝向；',
  '2. 找出3-6个最需要调整的重点点位，按重要程度排序；',
  '3. 每个点位给出方位、空间名称、布置方案简称、具体建议、实施时机、待确认事项和状态；',
  '4. x/y 坐标必须是该点位在这张图片上的百分比位置（x：0最左 100最右；y：0最上 100最下），落在对应空间的中心附近。',
].join('\n')

export async function analyzeFloorPlan({ apiKey, imageBase64, mediaType }) {
  const client = new Anthropic(apiKey ? { apiKey } : {})

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    const error = new Error('AI 无法分析这张图片，请更换一张清晰的户型图')
    error.code = 'refusal'
    throw error
  }

  const text = response.content.find((block) => block.type === 'text')?.text
  if (!text) {
    const error = new Error('AI 未返回分析结果，请稍后重试')
    error.code = 'empty'
    throw error
  }

  const parsed = JSON.parse(text)
  const clampPercent = (value) => Math.min(96, Math.max(4, Number(value) || 50))
  const points = parsed.points.slice(0, 8).map((point, index) => ({
    id: String(index + 1).padStart(2, '0'),
    sector: point.sector,
    place: point.place,
    short: point.short,
    advice: point.advice,
    schedule: point.schedule,
    warning: point.warning,
    status: point.status,
    x: clampPercent(point.x),
    y: clampPercent(point.y),
  }))

  return { summary: parsed.summary, points }
}
