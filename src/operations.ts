// using literal strings instead of numbers so that it's easier to inspect
// debugger events

export const enum TrackOpTypes {
  ATOM = 'atom',
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate',
  METHOD = 'method',
  EXPLICIT_KEY_CHANGE = 'explicit_key_change'
}

export const enum TriggerOpTypes {
  ATOM = 'atom',
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear',
  METHOD = 'method',
  EXPLICIT_KEY_CHANGE = 'explicit_key_change'
}


