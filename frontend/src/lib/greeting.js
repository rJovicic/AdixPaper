/** "Dobro jutro" / "Dobar dan" / "Dobra večer", by the local hour: the i18n key for the home greeting. */
export function greetingKey(date = new Date()) {
  const hour = date.getHours()
  if (hour < 10) return 'dashboard.greetMorning'
  if (hour < 18) return 'dashboard.greetDay'
  return 'dashboard.greetEvening'
}
