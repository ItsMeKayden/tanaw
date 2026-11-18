import { Suspense } from "react";

import { ApplicantProfileView } from "@/components/admission/views/applicant-profile-view";
import { ProfileSkeleton } from "@/components/ui/skeletons";

type ApplicantPageProps = Readonly<{ params: Promise<{ id: string }> }>;

export default function RegistrarApplicantProfilePage({ params }: ApplicantPageProps) {
  return (
    <Suspense fallback={<ProfileSkeleton label="applicant profile" />}>
      <ApplicantProfileView params={params} module="registrar" />
    </Suspense>
  );
}
