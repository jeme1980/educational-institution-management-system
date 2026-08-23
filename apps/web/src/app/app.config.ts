import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {provideRouter} from '@angular/router';
import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {TitleStrategy} from '@angular/router';

import {routes} from './app.routes';
import {authInterceptor} from './core/interceptors/auth.interceptor';
import {AppTitleStrategy} from './core/services/app-title.strategy';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(), 
    provideRouter(routes),
    {provide: TitleStrategy, useClass: AppTitleStrategy},
    provideHttpClient(withInterceptors([authInterceptor])),
    provideCharts(withDefaultRegisterables())
  ],
};
