export const easeOut = [.22, 1, .36, 1] as const;
export const surfaceSpring = {type:'spring',stiffness:420,damping:36,mass:.75} as const;
export const dockSpring = {type:'spring',bounce:.06,visualDuration:.5} as const;
export const quickFade = {duration:.16,ease:easeOut} as const;
