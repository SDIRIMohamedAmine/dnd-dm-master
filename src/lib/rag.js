// src/lib/rag.js — Open5e API (reverted from dnd5eapi)
import { supabase } from './supabase'

const OPEN5E = 'https://api.open5e.com'

export const ALL_ENDPOINTS = [
  { key: 'monsters',    label: 'Monsters',    icon: '🐉', desc: '~400 creatures with full stat blocks' },
  { key: 'spells',      label: 'Spells',      icon: '✨', desc: '~500 spells with full descriptions'   },
  { key: 'magicitems',  label: 'Magic Items', icon: '💍', desc: '~200 magic items'                     },
  { key: 'weapons',     label: 'Weapons',     icon: '⚔️', desc: 'All SRD weapons with damage + cost'   },
  { key: 'armor',       label: 'Armor',       icon: '🛡️', desc: 'All SRD armor with AC formulas'       },
  { key: 'backgrounds', label: 'Backgrounds', icon: '📜', desc: 'All backgrounds with features'        },
  { key: 'classes',     label: 'Classes',     icon: '🧙', desc: 'All 12 classes with features'         },
  { key: 'races',       label: 'Races',       icon: '🧝', desc: 'All races with traits and ASIs'       },
  { key: 'feats',       label: 'Feats',       icon: '⭐', desc: 'All feats with prerequisites'         },
  { key: 'conditions',  label: 'Conditions',  icon: '🌀', desc: 'All conditions'                       },
  { key: 'sections',    label: 'Rules (SRD)', icon: '📖', desc: 'Complete SRD rules text'              },
]

export async function fetchAllFromOpen5e(endpoint, onProgress) {
  const results = []
  let url = `${OPEN5E}/${endpoint}/?limit=100&format=json`
  while (url) {
    const res  = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    results.push(...data.results)
    url = data.next
    if (onProgress) onProgress(results.length, data.count || results.length)
  }
  return results
}

export function chunkMonster(m) {
  const actions   = (m.actions||[]).map(a=>`  • ${a.name}: ${a.desc}`).join('\n')
  const specials  = (m.special_abilities||[]).map(a=>`  • ${a.name}: ${a.desc}`).join('\n')
  const legendary = (m.legendary_actions||[]).map(a=>`  • ${a.name}: ${a.desc}`).join('\n')
  const reactions = (m.reactions||[]).map(a=>`  • ${a.name}: ${a.desc}`).join('\n')
  const saves = ['strength','dexterity','constitution','intelligence','wisdom','charisma']
    .map(s=>m[`${s}_save`]!=null&&`${s.slice(0,3).toUpperCase()} +${m[`${s}_save`]}`).filter(Boolean).join(', ')
  return {
    id:`monster:${m.slug}`, type:'monster', name:m.name, source:m.document__slug||'srd',
    text:[
      `MONSTER: ${m.name}`,
      `Type: ${m.type} | Size: ${m.size} | CR: ${m.challenge_rating} | Alignment: ${m.alignment}`,
      `AC: ${m.armor_class}${m.armor_desc?` (${m.armor_desc})`:''} | HP: ${m.hit_points} (${m.hit_dice}) | Speed: ${JSON.stringify(m.speed||{})}`,
      `STR ${m.strength} | DEX ${m.dexterity} | CON ${m.constitution} | INT ${m.intelligence} | WIS ${m.wisdom} | CHA ${m.charisma}`,
      saves&&`Saving Throws: ${saves}`,
      m.skills&&`Skills: ${JSON.stringify(m.skills)}`,
      m.damage_immunities&&`Damage Immunities: ${m.damage_immunities}`,
      m.damage_resistances&&`Damage Resistances: ${m.damage_resistances}`,
      m.condition_immunities&&`Condition Immunities: ${m.condition_immunities}`,
      `Senses: ${m.senses||'normal'} | Languages: ${m.languages||'none'}`,
      `XP: ${m.cr_xp||0}`,
      m.desc&&`\nLore: ${m.desc}`,
      specials&&`\nSpecial Abilities:\n${specials}`,
      actions&&`\nActions:\n${actions}`,
      reactions&&`\nReactions:\n${reactions}`,
      legendary&&`\nLegendary Actions:\n${legendary}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkSpell(s) {
  return {
    id:`spell:${s.slug}`, type:'spell', name:s.name, source:s.document__slug||'srd',
    text:[
      `SPELL: ${s.name}`,
      `Level: ${s.level_int===0?'Cantrip':`${s.level_int}th-level`} ${s.school}`,
      `Casting Time: ${s.casting_time} | Range: ${s.range} | Duration: ${s.duration}`,
      `Components: ${s.components}${s.material?` (${s.material})`:''}`,
      `Concentration: ${s.concentration==='yes'?'Yes':'No'} | Ritual: ${s.ritual==='yes'?'Yes':'No'}`,
      `Classes: ${s.dnd_class||'various'}`,
      `\n${s.desc}`,
      s.higher_level&&`\nAt Higher Levels: ${s.higher_level}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkMagicItem(item) {
  return {
    id:`item:${item.slug}`, type:'magic-item', name:item.name, source:item.document__slug||'srd',
    text:[
      `MAGIC ITEM: ${item.name}`,
      `Type: ${item.type} | Rarity: ${item.rarity}`,
      item.requires_attunement?'Attunement: Required':'Attunement: Not required',
      `\n${item.desc}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkWeapon(w) {
  const props = (w.properties||[]).map(p=>p.name||p).join(', ')
  return {
    id:`weapon:${w.slug}`, type:'weapon', name:w.name, source:w.document__slug||'srd',
    text:[
      `WEAPON: ${w.name}`,
      `Category: ${w.category} | Cost: ${w.cost} | Weight: ${w.weight}`,
      `Damage: ${w.damage_dice} ${w.damage_type}`,
      props&&`Properties: ${props}`,
      w.range&&`Range: ${w.range}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkArmor(a) {
  return {
    id:`armor:${a.slug}`, type:'armor', name:a.name, source:a.document__slug||'srd',
    text:[
      `ARMOR: ${a.name}`,
      `Category: ${a.category} | Cost: ${a.cost} | Weight: ${a.weight}`,
      `AC: ${a.ac_string}`,
      a.strength_requirement&&`Strength required: ${a.strength_requirement}`,
      a.stealth_disadvantage&&'Imposes Stealth disadvantage',
    ].filter(Boolean).join('\n'),
  }
}

export function chunkBackground(b) {
  return {
    id:`background:${b.slug}`, type:'background', name:b.name, source:b.document__slug||'srd',
    text:[
      `BACKGROUND: ${b.name}`,
      b.skill_proficiencies&&`Skills: ${b.skill_proficiencies}`,
      b.tool_proficiencies&&`Tools: ${b.tool_proficiencies}`,
      b.equipment&&`Equipment: ${b.equipment}`,
      b.desc&&`\n${b.desc}`,
      b.feature&&`\nFeature — ${b.feature}: ${b.feature_desc||''}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkClass(c) {
  const archetypes = (c.archetypes||[]).map(a=>`  • ${a.name}: ${a.desc||''}`).join('\n')
  return {
    id:`class:${c.slug}`, type:'class', name:c.name, source:c.document__slug||'srd',
    text:[
      `CLASS: ${c.name}`,
      `Hit Die: ${c.hit_dice} | Saving Throws: ${c.saving_throws||'varies'}`,
      c.prof_armor&&`Armor: ${c.prof_armor}`,
      c.prof_weapons&&`Weapons: ${c.prof_weapons}`,
      c.prof_skills&&`Skills: ${c.prof_skills}`,
      c.desc&&`\n${c.desc}`,
      archetypes&&`\nSubclasses:\n${archetypes}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkRace(r) {
  const subraces = (r.subraces||[]).map(s=>`  • ${s.name}: ${s.desc||''}`).join('\n')
  return {
    id:`race:${r.slug}`, type:'race', name:r.name, source:r.document__slug||'srd',
    text:[
      `RACE: ${r.name}`,
      r.asi_desc&&`Ability Score Increases: ${r.asi_desc}`,
      r.age&&`Age: ${r.age}`,
      r.size&&`Size: ${r.size}`,
      r.speed&&`Speed: ${r.speed}`,
      r.vision&&`Vision: ${r.vision}`,
      r.traits&&`\nTraits: ${r.traits}`,
      subraces&&`\nSubraces:\n${subraces}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkFeat(f) {
  return {
    id:`feat:${f.slug}`, type:'feat', name:f.name, source:f.document__slug||'srd',
    text:[`FEAT: ${f.name}`, f.prerequisite&&`Prerequisite: ${f.prerequisite}`, `\n${f.desc}`].filter(Boolean).join('\n'),
  }
}

export function chunkCondition(c) {
  return {
    id:`condition:${c.slug}`, type:'condition', name:c.name, source:c.document__slug||'srd',
    text:`CONDITION: ${c.name}\n\n${c.desc}`,
  }
}

export function chunkSection(s) {
  return {
    id:`section:${s.slug}`, type:'rule', name:s.name, source:s.document__slug||'srd',
    text:[`RULE: ${s.name}`, s.parent&&`Category: ${s.parent}`, `\n${(s.desc||'').slice(0,1200)}`].filter(Boolean).join('\n'),
  }
}

export const CHUNKER_MAP = {
  monsters:chunkMonster, spells:chunkSpell, magicitems:chunkMagicItem,
  weapons:chunkWeapon, armor:chunkArmor, backgrounds:chunkBackground,
  classes:chunkClass, races:chunkRace, feats:chunkFeat,
  conditions:chunkCondition, sections:chunkSection,
}

const STOP_WORDS = new Set(['the','and','for','are','but','not','you','all','can','has','this','that','with','have','from','they','will','your','which','their','been','what','does','how','when','where','who','tell','me','about','is','a','an','of','in','on','at','to','do','its','give','use','would','could','should','make','into','also','more','some','any','my','by','or','so','if'])

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP_WORDS.has(w))
}

export async function retrieveFromSupabase(query, topK=5) {
  const tokens = tokenize(query)
  if (!tokens.length) return []
  const {data:nameMatches} = await supabase.from('knowledge_chunks').select('chunk_id,type,name,source,content').ilike('name',`%${tokens[0]}%`).limit(topK*2)
  const {data:contentMatches} = await supabase.from('knowledge_chunks').select('chunk_id,type,name,source,content').textSearch('content',tokens.slice(0,3).join(' | '),{type:'websearch'}).limit(topK*2).catch(()=>({data:[]}))
  const all=[...(nameMatches||[]),...(contentMatches||[])]
  const seen=new Set()
  const unique=all.filter(r=>{if(seen.has(r.chunk_id))return false;seen.add(r.chunk_id);return true})
  const scored=unique.map(row=>{
    const nl=row.name.toLowerCase();const cl=row.content.toLowerCase();let score=0
    for(const t of tokens){if(nl===t)score+=8;else if(nl.includes(t))score+=4;if(cl.includes(t))score+=1}
    return{row,score}
  })
  return scored.sort((a,b)=>b.score-a.score).slice(0,topK).map(s=>({id:s.row.chunk_id,type:s.row.type,name:s.row.name,source:s.row.source,text:s.row.content}))
}

export function buildContextBlock(chunks) {
  if(!chunks.length) return 'No specific lore retrieved.'
  return chunks.map((c,i)=>`[${i+1}] ${c.text}`).join('\n\n---\n\n')
}

export async function lookupMonsterStats(name) {
  if(!name) return null
  const {data:exact}=await supabase.from('knowledge_chunks').select('content,name').eq('type','monster').ilike('name',name).limit(1)
  if(exact?.[0]) return parseMonsterChunk(exact[0])
  const words=name.split(' ').filter(w=>w.length>3)
  for(const word of [...words].reverse()){
    const {data}=await supabase.from('knowledge_chunks').select('content,name').eq('type','monster').ilike('name',`%${word}%`).limit(3)
    if(data?.length){
      const best=data.sort((a,b)=>{
        const as_=a.name.toLowerCase().split(' ').filter(w=>name.toLowerCase().includes(w)).length
        const bs_=b.name.toLowerCase().split(' ').filter(w=>name.toLowerCase().includes(w)).length
        return bs_-as_
      })[0];return parseMonsterChunk(best)
    }
  }
  return null
}

function parseMonsterChunk(row) {
  if(!row) return null
  const text=row.content
  const get=(rx)=>{const m=text.match(rx);return m?.[1]?.trim()||null}
  const ac=parseInt(get(/AC:\s*(\d+)/))||12
  const hp=parseInt(get(/HP:\s*(\d+)/))||10
  const cr=get(/CR:\s*([^\s|,\n]+)/)||'1/4'
  const stats={}
  ;['STR','DEX','CON','INT','WIS','CHA'].forEach(s=>{stats[s.toLowerCase()]=parseInt(get(new RegExp(`${s}\\s+(\\d+)`)))||10})
  const attacks=[]
  const actionSection=text.match(/Actions:\s*([\s\S]+?)(?:\nReactions:|$)/)?.[1]||''
  const atkMatches=[...actionSection.matchAll(/•\s*([^:]+):\s*[^+]*([+-]\d+)\s*to hit[^.]+Hit:\s*([^(]+)\(([^)]+)\)\s*([\w]+)\s+damage/gi)]
  for(const m of atkMatches) attacks.push({name:m[1].trim(),bonus:parseInt(m[2])||3,damage:`${m[4].trim()}+${parseInt(m[2])||0}`,type:m[5]?.toLowerCase()||'slashing'})
  const crXP={'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300}
  return{name:row.name,hp,maxHp:hp,ac,cr,xp:crXP[cr]||200,str:stats.str||10,dex:stats.dex||10,con:stats.con||10,int:stats.int||10,wis:stats.wis||10,cha:stats.cha||10,speed:30,attacks:attacks.length?attacks:[{name:'Attack',bonus:3,damage:'1d6+2',type:'slashing'}],flavor:['moves aggressively','strikes with precision'],fromDatabase:true}
}

export async function selectEncounterMonsters(character,difficulty='medium') {
  const level=character.level||1;const hp=character.current_hp||character.max_hp||10;const maxHP=character.max_hp||10
  const SOLO_BUDGETS={easy:[6,12,18,31,62,93,125,156,200,250],medium:[12,25,37,62,125,187,250,312,400,500],hard:[18,37,56,93,187,281,375,468,600,750]}
  let budget=(SOLO_BUDGETS[difficulty]||SOLO_BUDGETS.medium)[Math.min(level-1,9)]
  if(hp/maxHP<0.5) budget=SOLO_BUDGETS.easy[Math.min(level-1,9)]
  const crRange=level<=1?['0','1/8','1/4']:level<=2?['1/8','1/4','1/2']:level<=4?['1/4','1/2','1']:level<=6?['1/2','1','2']:['1','2','3']
  const crXP={'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700}
  let candidates=[]
  for(const cr of crRange){const xp=crXP[cr]||50;if(xp>budget*2)continue;const{data}=await supabase.from('knowledge_chunks').select('name,content').eq('type','monster').ilike('content',`%CR: ${cr}%`).limit(15);if(data?.length)candidates.push(...data.map(d=>({name:d.name,cr,xp})))}
  if(!candidates.length) return level<=2?['Goblin','Wolf']:level<=4?['Orc','Gnoll']:['Ogre','Ghoul']
  candidates=candidates.sort(()=>Math.random()-0.5)
  const encounter=[];let usedXP=0
  for(const c of candidates){const mult=[1,1.5,2,2.5][Math.min(encounter.length,3)];if(usedXP+c.xp*mult<=budget){encounter.push(c.name);usedXP+=c.xp}if(encounter.length>=3)break}
  return encounter.length?encounter:[candidates[0].name]
}
