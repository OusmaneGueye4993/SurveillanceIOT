import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Mot de passe "pro" :
 * - >= 8 caractères
 * - au moins 1 minuscule, 1 majuscule, 1 chiffre
 */
export function strongPasswordValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');

  if (!value) return null; // le required gère déjà le vide

  const okLength = value.length >= 8;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);

  return okLength && hasLower && hasUpper && hasDigit
    ? null
    : { strongPassword: true };
}