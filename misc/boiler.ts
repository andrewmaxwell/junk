export const calculateBoilerJoules = (
  targetTempC: number,
  roomTempC: number,
  totalBoilerVolumeLiters: number,
  waterMassGrams: number,
): number => {
  // 1. Liquid Energy (Q = m * c * ΔT)
  const liquidJoules = waterMassGrams * 4.184 * (targetTempC - roomTempC);

  // 2. Remaining Steam Headspace Volume (accounting for liquid thermal expansion)
  const steamVolumeLiters =
    totalBoilerVolumeLiters -
    waterMassGrams / (999.8 - targetTempC * (0.06 + 0.003 * targetTempC));

  // 3. Steam Density via Antoine equation & Ideal Gas Law (precomputed constants ≈ 0.288886)
  const steamDensity =
    (10 ** (8.14019 - 1810.94 / (244.485 + targetTempC)) * 0.288886) /
    (targetTempC + 273.15);

  // 4. Steam Energy (mass * latent heat)
  const steamJoules =
    steamVolumeLiters * steamDensity * (2500.8 - 2.36 * targetTempC);

  return liquidJoules + steamJoules;
};
