import { AppError, makeNamedError } from 'named-app-errors';

export {
  AppError,
  FetchError,
  GuruMeditationError,
  HookError,
  KeyError,
  NotAuthorizedError,
  ValidationError,
  KeyTypeError as InvalidKeyError,
  NotFoundError as ItemNotFoundError,
  makeNamedError
} from 'named-app-errors';

// TODO: XXX: update named-app-errors with new naming paradigm:
// TODO: XXX:   - add TestError
// TODO: XXX:   - add InvalidIdError
// TODO: XXX:   - add ExternalError (extended by the following new classes)
// TODO: XXX:   - add IllegalExternalEnvironmentError, IllegalEnvironmentError
// TODO: XXX:   - BC: rename "XTypeError"s
// TODO: XXX:   - BC: rename "NotFoundError" to "ItemNotFoundError"
// TODO: XXX:   - BC: add new "NotFoundError" that now takes any message

// * -- * \\

export class TestError extends AppError {}
makeNamedError(TestError, 'TestError');

// * -- * \\

export class NotFoundError extends AppError {
  constructor(message?: string) {
    super(message || 'resource not found');
  }
}

makeNamedError(NotFoundError, 'NotFoundError');

// * -- * \\

export class InvalidIdError<T = string | number> extends AppError {
  constructor(id?: T) {
    super(
      id
        ? `expected valid ObjectId instance, got "${id}" instead`
        : 'invalid ObjectId encountered'
    );
  }
}

makeNamedError(InvalidIdError, 'InvalidIdError');

// * -- * \\

export class IllegalEnvironmentError extends AppError {
  constructor(message?: string) {
    super('illegal environment detected' + (message ? `: ${message}` : ''));
  }
}

makeNamedError(IllegalEnvironmentError, 'IllegalEnvironmentError');

// * -- * \\

export class ExternalError extends AppError {
  constructor(message?: string) {
    super(message || 'an error occurred while executing an external script');
  }
}

makeNamedError(ExternalError, 'ExternalError');

// * -- * \\

export class IllegalExternalEnvironmentError extends AppError {
  constructor(message?: string) {
    super('illegal external environment detected' + (message ? `: ${message}` : ''));
  }
}

makeNamedError(IllegalExternalEnvironmentError, 'IllegalExternalEnvironmentError');
