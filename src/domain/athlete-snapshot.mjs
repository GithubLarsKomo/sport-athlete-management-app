export async function buildAthleteSnapshot(repository, athleteId) {
  const latestCompleted = await repository.getLatestCompletedSession(athleteId);
  const activePlanned = await repository.getTodaySession(athleteId);
  const completedPrescription = !activePlanned && latestCompleted?.planned_session_id
    ? await repository.getPlannedSessionById(athleteId, latestCompleted.planned_session_id)
    : null;

  return {
    profile: await repository.getProfile(athleteId),
    context: await repository.getContext(athleteId),
    planned_session: activePlanned || completedPrescription,
    daily_checkin: await repository.getTodayCheckin(athleteId),
    latest_completed_session: latestCompleted,
    specialist_artifacts: repository.getLatestSpecialistArtifacts
      ? await repository.getLatestSpecialistArtifacts(athleteId)
      : []
  };
}
