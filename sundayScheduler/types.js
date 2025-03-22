/**
@typedef {{
  name: string,
  roles: Record<string, number>,
  weights: Record<string, {weight: number, anywhere: boolean}>,
  isFemale: boolean,
  over21: boolean
}} Person

@typedef {{
  name: string, 
  determined: boolean
}} Assignment

@typedef {{
  date: Date,
  roles: Record<string, string[]>,
  unavailable: Set<string>,
  assignments: Record<string, Assignment[]>
}} ScheduleRow

@typedef {{
  people: Record<string, Person>, 
  schedule: ScheduleRow[], 
  roleInfo: Record<string, {location: string, isChildren: boolean}>
}} State
 */
