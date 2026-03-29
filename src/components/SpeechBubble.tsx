import { useEffect, useState } from 'react'
import './SpeechBubble.css'

const IDLE_LINES = [
  '今天天气不错~',
  '主人别光看呀，去干活！',
  '我好像闻到了…bug 的味道',
  '龙虾龙虾，天下无双',
  '摸鱼是不可能摸鱼的',
  'Gateway 一切正常，放心吧~',
  '无聊…来个人陪我聊天',
  '我走了一万步了，你呢？',
  '听说今天有新的 deploy',
  '不要戳我！会痛！',
]

const WORKING_LINES = [
  '火太大了！火太大了！',
  '颠勺颠到手酸…',
  '忙死了忙死了~',
  '别催了别催了！',
]

const ERROR_LINES = [
  '出事了出事了！',
  '救命啊——冒烟了！',
  '好像…出了点问题',
]

interface SpeechBubbleProps {
  visible: boolean
  gatewayState: string
  onHide: () => void
  position?: 'above' | 'below'
}

export default function SpeechBubble({ visible, gatewayState, onHide, position = 'above' }: SpeechBubbleProps) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (!visible) return
    let pool = IDLE_LINES
    if (gatewayState === 'working') pool = WORKING_LINES
    else if (gatewayState === 'error') pool = ERROR_LINES
    setText(pool[Math.floor(Math.random() * pool.length)])

    const timer = setTimeout(onHide, 3500)
    return () => clearTimeout(timer)
  }, [visible, gatewayState, onHide])

  if (!visible) return null

  return (
    <div className={`speech-bubble ${position === 'below' ? 'below' : ''}`}>
      <div className="speech-bubble-text">{text}</div>
      <div className="speech-bubble-arrow" />
    </div>
  )
}
