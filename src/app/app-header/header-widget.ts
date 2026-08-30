import { InjectionToken, Type } from '@angular/core';

// Any feature can contribute a standalone component to the header by providing it into this
// token (multi: true), without the header needing to import or know about that feature.
export const HEADER_WIDGETS = new InjectionToken<Type<unknown>[]>('HEADER_WIDGETS');
