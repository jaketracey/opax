import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pilotControls } from '../scripts/audit_controls.ts'
import { hasNewPersonalName } from '../src/validate.ts'

test('audit selectors stop before personal honorifics and incomplete subsequent offices', () => {
  for (const text of ['Minister for Education and Training Mr Zelara Quenwick spoke.', 'Minister for Customs and Consumer Affairs and Minister Assisting the Prime Minister spoke.']) {
    const controls = pilotControls(text).controls.filter(c => c.category === 'titles')
    assert.ok(controls.length)
    assert.ok(controls.every(c => !c.text.includes('Quenwick') && !c.text.endsWith('Assisting')))
    assert.ok(controls.every(c => !hasNewPersonalName(c.text, text)))
  }
})

test('audit law controls reject personal-title fragments and restore split hyphenated titles', () => {
  const malformed = pilotControls('Mr Bill Quenwick spoke. Dr Bill Quenwick spoke. General Bill Quenwick spoke.')
  assert.equal(malformed.controls.filter(c => c.category === 'laws').length, 0)
  assert.equal(malformed.malformed, 3)
  const legitimate = pilotControls('Discussed the Attorney-General Act and regional services.')
  assert.equal(legitimate.controls.find(c => c.category === 'laws')?.text, 'Attorney-General Act')
})
