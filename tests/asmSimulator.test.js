import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AsmSimulator } from '../src/core/asmSimulator.js'
import { highlightAssembly } from '../src/utils/syntaxHighlighter.js'

test('byte arithmetic sets flag bits at the byte boundary', () => {
  const sim = new AsmSimulator('MOV AL, 0FFH\nADD AL, 1\nMOV AL, 7FH\nADD AL, 1\nCMP AL, 1')
  sim.run()
  assert.deepEqual(sim.getFullState(2).flags, { z: true, sf: false, of: false, cf: true })
  assert.deepEqual(sim.getFullState(4).flags, { z: false, sf: true, of: true, cf: false })
  assert.equal(sim.getFullState(5).flags.of, true)
})

test('INC and DEC preserve carry for both register widths', () => {
  const sim = new AsmSimulator('STC\nINC AX\nDEC AL\nCLC\nDEC AX')
  sim.run()
  assert.equal(sim.getFullState(2).flags.cf, true)
  assert.equal(sim.getFullState(3).flags.cf, true)
  assert.equal(sim.getFullState(5).flags.cf, false)
})

test('history includes the terminating instruction and errors', () => {
  const normal = new AsmSimulator('MOV AX, 5\nHLT\nMOV AX, 9')
  normal.run()
  assert.equal(normal.history.length, 3)
  assert.equal(normal.getFullState(2).currentInstruction.mnemonic, 'HLT')
  assert.equal(normal.getFullState(2).ax, 5)
  assert.equal(normal.step(), false)

  const error = new AsmSimulator('JMP MISSING')
  error.run()
  assert.match(error.getFullState(1).error, /MISSING/)

  const noInput = new AsmSimulator('MOV AH, 01H\nINT 21H')
  noInput.run()
  assert.match(noInput.getFullState(2).error, /输入已耗尽/)
})

test('DOS buffered input stops at newline and remains in sparse history', () => {
  const sim = new AsmSimulator('MOV BYTE PTR [100H], 4\nMOV DX, 100H\nMOV AH, 0AH\nINT 21H\nMOV AH, 01H\nINT 21H')
  sim.setInput('abcde\r\nZ')
  sim.run()
  assert.deepEqual(sim.getFullState(4).memory.slice(0x100, 0x106), [4, 3, 97, 98, 99, 13])
  assert.equal(sim.getFullState(6).ax & 0xFF, 90)
})

test('semicolon literals survive comments and remain visible in the editor', () => {
  const sim = new AsmSimulator("DATA SEGMENT\nMSG DB 'A;B$' ; note\nDATA ENDS\nCODE SEGMENT\nMOV DX, OFFSET MSG\nMOV AH, 09H\nINT 21H\nHLT\nCODE ENDS")
  sim.run()
  assert.deepEqual(sim.getFullState(4).output, ['A;B'])
  assert.deepEqual(sim.getFullState(2).output, [])
  const markup = highlightAssembly("  MOV DL, ';' ; <tag>")
  assert.match(markup, /<span class="instruction">MOV<\/span>/)
  assert.match(markup, /<span class="string">';'<\/span>/)
  assert.match(markup, /<span class="comment">; &lt;tag&gt;<\/span>/)
})
