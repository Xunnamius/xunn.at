// ? Environment variables specific to this application are defined here.

type CustomEnv = {
  //CUSTOM_VAR: string;
};

/**
 * This function is called when constructing the application's internal
 * environment object. It is passed the current environment object as an
 * optional parameter and returns the final environment object.
 */
export function getEnv<T>(env: T): T & CustomEnv {
  return {
    ...env
    //CUSTOM_VAR: 'custom value'
  };
}
