import { Routes } from '@angular/router';
import { authGuardGuard } from './auth/auth-guard.guard';
import { MapsComponent } from './maps/maps.component';

export const routes: Routes = [
  { path: '', component: MapsComponent, pathMatch: 'full' },
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.module').then((m) => m.AuthModule),
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./admin/admin.module').then((m) => m.AdminModule),
    canActivate: [authGuardGuard],
  },
];
