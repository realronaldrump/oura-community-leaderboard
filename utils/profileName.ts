type ProfileLike = {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
};

export const getProfileDisplayName = (profile: ProfileLike): string => {
    if (profile.firstName) {
        return `${profile.firstName} ${profile.lastName || ''}`.trim();
    }
    const email = profile.email || 'User';
    return email.split('@')[0];
};
