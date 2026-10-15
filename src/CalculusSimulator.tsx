import { useMemo, useState } from 'react'
import './CalculusSimulator.css'
import { SimulatorThemePicker, useSimulatorTheme } from './SimulatorTheme'

type Expr =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'unary'; op: '-'; value: Expr }
  | { type: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Expr; right: Expr }
  | { type: 'function'; name: string; value: Expr }

type Token = { kind: 'number' | 'identifier' | 'operator'; value: string }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const pattern = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z_][A-Za-z_0-9]*)|([()+\-*/^,]))/gy
  let cursor = 0
  while (cursor < source.length) {
    pattern.lastIndex = cursor
    const match = pattern.exec(source)
    if (!match) throw new Error('Use numbers, x, parentheses, + − * / ^, and supported function names.')
    cursor = pattern.lastIndex
    if (match[1]) tokens.push({ kind: 'number', value: match[1] })
    else if (match[2]) tokens.push({ kind: 'identifier', value: match[2].toLowerCase() })
    else if (match[3]) tokens.push({ kind: 'operator', value: match[3] })
  }
  return tokens
}

function parseExpression(source: string): Expr {
  const tokens = tokenize(source.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi'))
  let index = 0
  const peek = () => tokens[index]
  const take = (value?: string) => {
    const token = tokens[index]
    if (value !== undefined && token?.value !== value) return false
    index++
    return token
  }
  const primary = (): Expr => {
    const token = peek()
    if (!token) throw new Error('Enter an expression to calculate.')
    if (take('(')) {
      const expression = additive()
      if (!take(')')) throw new Error('Add a closing parenthesis.')
      return expression
    }
    if (token.value === '-') { take('-'); return { type: 'unary', op: '-', value: primary() } }
    if (token.kind === 'number') { take(); return { type: 'number', value: Number(token.value) } }
    if (token.kind === 'identifier') {
      take()
      if (token.value === 'pi') return { type: 'number', value: Math.PI }
      if (token.value === 'e') return { type: 'number', value: Math.E }
      if (take('(')) {
        const argument = additive()
        if (!take(')')) throw new Error('Add a closing parenthesis after the function.')
        if (!['sin', 'cos', 'tan', 'exp', 'ln', 'log', 'sqrt', 'abs'].includes(token.value)) throw new Error('Supported functions: sin, cos, tan, exp, ln, log, sqrt, abs.')
        return { type: 'function', name: token.value === 'log' ? 'ln' : token.value, value: argument }
      }
      return { type: 'variable', name: token.value }
    }
    throw new Error('Expected a number, variable, function, or parenthesized expression.')
  }
  const power = (): Expr => {
    const left = primary()
    if (take('^')) return binary('^', left, unary())
    return left
  }
  const unary = (): Expr => {
    if (take('-')) return neg(unary())
    if (take('+')) return unary()
    return power()
  }
  const multiplicative = (): Expr => {
    let value = unary()
    while (true) {
      if (take('*')) value = binary('*', value, unary())
      else if (take('/')) value = binary('/', value, unary())
      else if (peek() && (peek()!.kind === 'number' || peek()!.kind === 'identifier' || peek()!.value === '(')) value = binary('*', value, unary())
      else break
    }
    return value
  }
  const additive = (): Expr => {
    let value = multiplicative()
    while (true) {
      if (take('+')) value = binary('+', value, multiplicative())
      else if (take('-')) value = binary('-', value, multiplicative())
      else break
    }
    return value
  }
  const result = additive()
  if (index !== tokens.length) throw new Error('Check the expression near "' + tokens[index].value + '".')
  return result
}

const n = (value: number): Expr => ({ type: 'number', value })
const variable = (name: string): Expr => ({ type: 'variable', name })
const fn = (name: string, value: Expr): Expr => ({ type: 'function', name, value })
const isNumber = (value: Expr, number?: number) => value.type === 'number' && (number === undefined || value.value === number)
function neg(value: Expr): Expr {
  if (isNumber(value)) return n(-(value as Extract<Expr, { type: 'number' }>).value)
  if (value.type === 'unary') return value.value
  return { type: 'unary', op: '-', value }
}
function binary(op: '+' | '-' | '*' | '/' | '^', left: Expr, right: Expr): Expr {
  if (left.type === 'number' && right.type === 'number') {
    const a = left.value, b = right.value
    if (op === '+') return n(a + b)
    if (op === '-') return n(a - b)
    if (op === '*') return n(a * b)
    if (op === '/' && b !== 0) return n(a / b)
    if (op === '^') return n(a ** b)
  }
  if (op === '+') { if (isNumber(left, 0)) return right; if (isNumber(right, 0)) return left }
  if (op === '-') { if (isNumber(right, 0)) return left; if (isNumber(left, 0)) return neg(right) }
  if (op === '*') { if (isNumber(left, 0) || isNumber(right, 0)) return n(0); if (isNumber(left, 1)) return right; if (isNumber(right, 1)) return left; if (isNumber(left, -1)) return neg(right); if (isNumber(right, -1)) return neg(left) }
  if (op === '/') { if (isNumber(left, 0)) return n(0); if (isNumber(right, 1)) return left }
  if (op === '^') { if (isNumber(right, 0)) return n(1); if (isNumber(right, 1)) return left; if (isNumber(left, 1)) return n(1) }
  return { type: 'binary', op, left, right }
}
function d(value: Expr, variableName: string): Expr {
  if (value.type === 'number') return n(0)
  if (value.type === 'variable') return n(value.name === variableName ? 1 : 0)
  if (value.type === 'unary') return neg(d(value.value, variableName))
  if (value.type === 'function') {
    const u = value.value, du = d(u, variableName)
    if (value.name === 'sin') return binary('*', fn('cos', u), du)
    if (value.name === 'cos') return binary('*', neg(fn('sin', u)), du)
    if (value.name === 'tan') return binary('*', binary('/', n(1), binary('^', fn('cos', u), n(2))), du)
    if (value.name === 'exp') return binary('*', fn('exp', u), du)
    if (value.name === 'ln') return binary('/', du, u)
    if (value.name === 'sqrt') return binary('/', du, binary('*', n(2), fn('sqrt', u)))
    throw new Error('The derivative of abs is not defined by this basic rule set.')
  }
  const { op, left, right } = value
  const dl = d(left, variableName), dr = d(right, variableName)
  if (op === '+') return binary('+', dl, dr)
  if (op === '-') return binary('-', dl, dr)
  if (op === '*') return binary('+', binary('*', dl, right), binary('*', left, dr))
  if (op === '/') return binary('/', binary('-', binary('*', dl, right), binary('*', left, dr)), binary('^', right, n(2)))
  if (right.type === 'number') return binary('*', binary('*', right, binary('^', left, n(right.value - 1))), dl)
  return binary('*', binary('^', left, right), binary('+', binary('*', dr, fn('ln', left)), binary('/', binary('*', right, dl), left)))
}
function linearForm(value: Expr, variableName: string): { a: number; b: number } | null {
  if (value.type === 'number') return { a: 0, b: value.value }
  if (value.type === 'variable') return value.name === variableName ? { a: 1, b: 0 } : null
  if (value.type === 'unary') { const inner = linearForm(value.value, variableName); return inner ? { a: -inner.a, b: -inner.b } : null }
  if (value.type !== 'binary') return null
  const left = linearForm(value.left, variableName), right = linearForm(value.right, variableName)
  if (value.op === '+' || value.op === '-') {
    if (!left || !right) return null
    const sign = value.op === '+' ? 1 : -1
    return { a: left.a + sign * right.a, b: left.b + sign * right.b }
  }
  if (value.op === '*') {
    if (!left || !right || (left.a !== 0 && right.a !== 0)) return null
    if (left.a === 0) return { a: left.b * right.a, b: left.b * right.b }
    return { a: right.b * left.a, b: right.b * left.b }
  }
  if (value.op === '/' && left && right?.a === 0 && right.b !== 0) return { a: left.a / right.b, b: left.b / right.b }
  return null
}
function integrate(value: Expr, variableName: string): Expr {
  if (value.type === 'number') return binary('*', value, variable(variableName))
  if (value.type === 'variable') {
    if (value.name !== variableName) return binary('*', value, variable(variableName))
    return binary('/', binary('^', value, n(2)), n(2))
  }
  if (value.type === 'unary') return neg(integrate(value.value, variableName))
  if (value.type === 'function') {
    const line = linearForm(value.value, variableName)
    if (!line || line.a === 0) throw new Error('For function integrals, use a linear inside expression such as sin(2x + 1).')
    const a = n(line.a), u = value.value
    if (value.name === 'sin') return binary('/', neg(fn('cos', u)), a)
    if (value.name === 'cos') return binary('/', fn('sin', u), a)
    if (value.name === 'tan') return binary('/', neg(fn('ln', fn('abs', fn('cos', u)))), a)
    if (value.name === 'exp') return binary('/', fn('exp', u), a)
    if (value.name === 'ln') return binary('/', binary('-', binary('*', u, fn('ln', fn('abs', u))), u), a)
    if (value.name === 'sqrt') return integrate(binary('^', u, n(0.5)), variableName)
    throw new Error('This function does not have a supported basic antiderivative.')
  }
  const { op, left, right } = value
  if (op === '+') return binary('+', integrate(left, variableName), integrate(right, variableName))
  if (op === '-') return binary('-', integrate(left, variableName), integrate(right, variableName))
  if (op === '*') {
    if (left.type === 'number') return binary('*', left, integrate(right, variableName))
    if (right.type === 'number') return binary('*', right, integrate(left, variableName))
    const leftLine = linearForm(left, variableName), rightLine = linearForm(right, variableName)
    if (leftLine?.a === 0) return binary('*', left, integrate(right, variableName))
    if (rightLine?.a === 0) return binary('*', right, integrate(left, variableName))
    throw new Error('This product needs integration by parts or substitution; this workspace currently handles sums, constants, powers, and common functions of a linear expression.')
  }
  if (op === '/') {
    if (isNumber(left, 1)) {
      const line = linearForm(right, variableName)
      if (line?.a && line.a !== 0) return binary('/', fn('ln', fn('abs', right)), n(line.a))
    }
    if (right.type === 'number' && right.value !== 0) return binary('/', integrate(left, variableName), right)
    throw new Error('This quotient does not match a supported basic integration rule.')
  }
  if (op === '^') {
    const line = linearForm(left, variableName)
    if (!line || line.a === 0 || right.type !== 'number') throw new Error('Power integration currently supports (a x + b)^n.')
    const exponent = right.value
    if (exponent === -1) return binary('/', fn('ln', fn('abs', left)), n(line.a))
    return binary('/', binary('^', left, n(exponent + 1)), n(line.a * (exponent + 1)))
  }
  throw new Error('No integration rule matched this expression.')
}
function format(value: Expr, parentPrecedence = 0): string {
  if (value.type === 'number') {
    if (Math.abs(value.value - Math.PI) < 1e-12) return 'π'
    if (Math.abs(value.value - Math.E) < 1e-12) return 'e'
    return Number(value.value.toPrecision(8)).toString()
  }
  if (value.type === 'variable') return value.name
  if (value.type === 'unary') return '-' + format(value.value, 4)
  if (value.type === 'function') return value.name + '(' + format(value.value) + ')'
  const precedence = value.op === '+' || value.op === '-' ? 1 : value.op === '*' || value.op === '/' ? 2 : 3
  let text: string
  if (value.op === '*') {
    const leftNegative = value.left.type === 'unary'
    const rightNegative = value.right.type === 'unary'
    if (leftNegative && rightNegative) text = format(value.left.value, precedence) + ' * ' + format(value.right.value, precedence)
    else if (leftNegative) text = '-' + format(value.left.value, precedence) + ' * ' + format(value.right, precedence)
    else if (rightNegative) text = '-' + format(value.left, precedence) + ' * ' + format(value.right.value, precedence)
    else text = format(value.left, precedence) + ' * ' + format(value.right, precedence)
  } else {
    const operator = value.op === '^' ? '^' : ' ' + value.op + ' '
    text = format(value.left, precedence) + operator + format(value.right, precedence + (value.op === '^' ? -1 : 1))
  }
  return precedence < parentPrecedence ? '(' + text + ')' : text
}

export default function CalculusSimulator({ onBack }: { onBack: () => void }) {
  const [theme, setTheme] = useSimulatorTheme()
  const [operation, setOperation] = useState<'differentiate' | 'integrate'>('differentiate')
  const [expression, setExpression] = useState('x^2 + 3x + 2')
  const [variableName, setVariableName] = useState('x')
  const result = useMemo(() => {
    try {
      if (!expression.trim()) return { answer: '', error: '' }
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(variableName.trim())) throw new Error('Use a single variable name, like x or t.')
      const parsed = parseExpression(expression)
      const calculated = operation === 'differentiate' ? d(parsed, variableName.trim().toLowerCase()) : integrate(parsed, variableName.trim().toLowerCase())
      return { answer: format(calculated) + (operation === 'integrate' ? ' + C' : ''), error: '' }
    } catch (error) {
      return { answer: '', error: error instanceof Error ? error.message : 'Could not calculate this expression.' }
    }
  }, [expression, operation, variableName])
  return <main className="calculus-workspace" data-theme={theme}>
    <header className="calculus-topbar">
      <button type="button" className="calculus-back" onClick={onBack}><span aria-hidden="true">‹</span> Simulators</button>
      <div className="calculus-brand"><span className="calculus-brand-icon">∫</span><span><strong>Ozoo Calculus</strong><small>Derivatives & integrals</small></span></div>
      <SimulatorThemePicker theme={theme} onChange={setTheme} />
    </header>
    <main className="calculus-layout">
      <section className="calculus-intro"><p>CALCULUS WORKSPACE</p><h1>Derivation & integration</h1><span>Enter an expression to calculate its derivative or an antiderivative.</span></section>
      <section className="calculus-card" aria-label="Calculus problem">
        <div className="calculus-mode" role="group" aria-label="Choose operation">
          <button type="button" className={operation === 'differentiate' ? 'active' : ''} aria-pressed={operation === 'differentiate'} onClick={() => setOperation('differentiate')}>Derivative <small>d / dx</small></button>
          <button type="button" className={operation === 'integrate' ? 'active' : ''} aria-pressed={operation === 'integrate'} onClick={() => setOperation('integrate')}>Integral <small>∫ dx</small></button>
        </div>
        <label className="calculus-label">Expression
          <div className="calculus-input-wrap"><span>{operation === 'differentiate' ? 'd/d' + variableName : '∫'} </span><input value={expression} onChange={(event) => setExpression(event.target.value)} aria-label="Expression to calculate" placeholder="x^2 + 3x + 2" autoComplete="off" spellCheck={false} /><span>{operation === 'integrate' ? 'd' + variableName : ''}</span></div>
        </label>
        <label className="calculus-variable">Variable<input value={variableName} onChange={(event) => setVariableName(event.target.value)} maxLength={8} aria-label="Calculus variable" /></label>
        <section className="calculus-answer" aria-live="polite"><div><span>ANSWER</span><small>{operation === 'differentiate' ? 'Derivative' : 'Indefinite integral'}</small></div>{result.error ? <p className="calculus-error" role="alert">{result.error}</p> : <output>{result.answer || 'Your result will appear here.'}</output>}</section>
      </section>
      <aside className="calculus-guide"><strong>What it supports</strong><p><b>Derivatives:</b> sums, products, quotients, powers, and chain rule for sin, cos, tan, exp, ln, and sqrt.</p><p><b>Integrals:</b> sums, constants, powers of a linear expression, and common functions with a linear inside expression.</p><small>This symbolic helper shows the result directly. Advanced integrals such as integration by parts are not included yet.</small></aside>
    </main>
  </main>
}
