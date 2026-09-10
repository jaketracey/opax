const container = document.getElementById('map')
try {
  const { mountMoneyMap } = await import('/money-map.js?v=mobile-1')
  document.getElementById('status')?.remove()
  // Embed testbed: /map.html?focus=party:Labor&chrome=mini exercises the
  // options subject pages use.
  const params = new URLSearchParams(location.search)
  // ?jur=qld|vic|tas loads a state commission export (same shape as the
  // federal file; the two are never summed - see docs/DATA-MONEY.md).
  const STATE_FILES = {
    qld: ['/graph/money.qld.json', 'Electoral Commission of Queensland gifts register'],
    vic: ['/graph/money.vic.json', 'Victorian Electoral Commission disclosures'],
    tas: ['/graph/money.tas.json', 'Tasmanian Electoral Commission disclosures'],
  }
  const state = STATE_FILES[params.get('jur')]
  if (state) {
    document.querySelector('header p').textContent =
      'Who funds state politics: the top disclosed donors and the parties they gave to, from the ' +
      state[1] + '. Colour and territory are the donor\'s industry; size is disclosed dollars. ' +
      'Gifts under the disclosure threshold are not reported; state and federal returns are not summed.'
  }
  await mountMoneyMap(container, state ? state[0] : '/graph/money.json', {
    focus: params.get('focus') || undefined,
    chrome: params.get('chrome') === 'mini' ? 'mini' : undefined,
    onSelect: (node) => console.log('[money-map] user selected:', node && node.id),
  })
} catch (error) {
  container.replaceChildren()
  const status = document.createElement('div')
  status.id = 'status'
  status.setAttribute('role', 'alert')
  status.textContent = 'The money map could not load. Please reload the page to try again.'
  container.append(status)
  console.error('[money-map] Failed to load', error)
}
