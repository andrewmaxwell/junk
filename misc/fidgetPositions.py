import numpy as np

def run_failure_analysis():
    print("--- Fidget Toy Failure Mode Analysis ---")
    
    # ==========================================
    # 1. CONFIGURATION (Same as before)
    # ==========================================
    HUB_WIDTH = 1.25
    HUB_HEIGHT = 0.75
    ARM_LENGTH = 2.0
    THICKNESS = 0.25
    NUM_LINKS = 6
    LINK_LENGTH = ARM_LENGTH / NUM_LINKS 
    HUB_APOTHEM = HUB_WIDTH / 2.0 
    MIN_DIST_SQ = THICKNESS ** 2
    
    POSSIBLE_ANGLES = np.radians([-90, -45, 0, 45, 90])
    
    # ==========================================
    # 2. SEPARATE CHECK FUNCTIONS
    # ==========================================

    def get_segment_distance_sq(p1, p2, p3, p4):
        # (Same optimized math as previous script)
        u = p2 - p1
        v = p4 - p3
        w = p1 - p3
        a = np.dot(u, u); b = np.dot(u, v); c = np.dot(v, v)
        d = np.dot(u, w); e = np.dot(v, w)
        D = a * c - b * b
        
        if D < 1e-8:
            sc = 0.0
            tc = d / b if b > 1e-8 else e / c if c > 1e-8 else 0.0
        else:
            sc = (b * e - c * d) / D
            tc = (a * e - b * d) / D
            
        if sc < 0: sc = 0
        elif sc > 1: sc = 1
        
        if tc < 0: tc = 0
        elif tc > 1: tc = 1
        
        if sc < 1e-8: tc = max(0, min(1, e / c if c > 1e-8 else 0.0))
        elif sc > 1 - 1e-8: tc = max(0, min(1, (e + b) / c if c > 1e-8 else 0.0))
            
        dP = w + (sc * u) - (tc * v)
        return np.dot(dP, dP)

    def build_arm(arm_index, angles):
        # (Same kinematics as previous script)
        face_angle = np.radians(arm_index * 60) 
        c, s = np.cos(face_angle), np.sin(face_angle)
        current_pos = np.array([HUB_APOTHEM * c, HUB_APOTHEM * s, 0.0])
        fwd = np.array([c, s, 0.0])
        up = np.array([0.0, 0.0, 1.0])
        right = np.cross(fwd, up)
        
        segments = []
        for i in range(NUM_LINKS):
            theta = angles[i]
            cos_t, sin_t = np.cos(theta), np.sin(theta)
            if i % 2 == 0: 
                new_fwd = fwd * cos_t + up * sin_t
                new_up  = up * cos_t - fwd * sin_t
                fwd, up = new_fwd, new_up
            else: 
                new_fwd = fwd * cos_t + right * sin_t
                new_right = right * cos_t - fwd * sin_t
                fwd, right = new_fwd, new_right
            next_pos = current_pos + (fwd * LINK_LENGTH)
            segments.append((current_pos, next_pos))
            current_pos = next_pos
        return segments

    def analyze_configuration(all_arms_segments):
        """
        Returns a tuple of booleans: (is_hub_crash, is_self_crash, is_inter_crash)
        """
        hit_hub = False
        hit_self = False
        hit_inter = False
        
        # Flatten structure
        flat = []
        for a_idx, arm in enumerate(all_arms_segments):
            for l_idx, seg in enumerate(arm):
                flat.append((seg[0], seg[1], a_idx, l_idx))
        n = len(flat)
        
        # 1. Check Hub Intersection
        for p1, p2, _, link_i in flat:
            if hit_hub: break # Optimization: stop checking hub if already hit
            if link_i > 0:
                mid = (p1 + p2) / 2
                dist_from_z = np.sqrt(mid[0]**2 + mid[1]**2)
                if dist_from_z < (HUB_APOTHEM + THICKNESS/2):
                    if abs(mid[2]) < (HUB_HEIGHT/2 + THICKNESS/2):
                        hit_hub = True

        # 2. Check Segment Intersections
        for i in range(n):
            # If we already found both collision types, we can stop early
            if hit_self and hit_inter: break
            
            p1, p2, arm_i, link_i = flat[i]
            
            for j in range(i + 1, n):
                q1, q2, arm_j, link_j = flat[j]
                
                # Filter adjacent segments
                if arm_i == arm_j and abs(link_i - link_j) <= 1:
                    continue
                
                # Decide which flag we are looking for
                is_same_arm = (arm_i == arm_j)
                if is_same_arm and hit_self: continue
                if not is_same_arm and hit_inter: continue
                
                # Bounding Box Optimization
                mid_p = (p1 + p2) / 2
                mid_q = (q1 + q2) / 2
                if np.sum((mid_p - mid_q)**2) > (LINK_LENGTH + THICKNESS)**2:
                    continue

                # Precise Check
                if get_segment_distance_sq(p1, p2, q1, q2) < MIN_DIST_SQ:
                    if is_same_arm:
                        hit_self = True
                    else:
                        hit_inter = True
                        
        return hit_hub, hit_self, hit_inter

    # ==========================================
    # 3. EXECUTION
    # ==========================================
    SAMPLES = 50000 # Reduced slightly as this script is slower
    print(f"Analyzing {SAMPLES} configurations (Detailed Breakdown)...")
    
    stats = {
        'valid': 0,
        'hub_collisions': 0,
        'self_collisions': 0,
        'inter_arm_collisions': 0,
        'total_invalid': 0
    }
    
    rng = np.random.default_rng()
    random_indices = rng.integers(0, 5, size=(SAMPLES, 6, NUM_LINKS))
    
    for s in range(SAMPLES):
        if s % 5000 == 0 and s > 0: print(f"Analyzed {s}...")
            
        current_angles = POSSIBLE_ANGLES[random_indices[s]]
        arms = [build_arm(a, current_angles[a]) for a in range(6)]
        
        h_crash, s_crash, i_crash = analyze_configuration(arms)
        
        if not (h_crash or s_crash or i_crash):
            stats['valid'] += 1
        else:
            stats['total_invalid'] += 1
            if h_crash: stats['hub_collisions'] += 1
            if s_crash: stats['self_collisions'] += 1
            if i_crash: stats['inter_arm_collisions'] += 1

    # ==========================================
    # 4. REPORT
    # ==========================================
    inv = stats['total_invalid']
    if inv == 0: inv = 1 # Avoid div by zero
    
    print("\n" + "="*40)
    print(f"FAILURE BREAKDOWN (N={SAMPLES})")
    print("="*40)
    print(f"Total Valid:   {stats['valid']} ({stats['valid']/SAMPLES:.2%})")
    print(f"Total Invalid: {stats['total_invalid']} ({stats['total_invalid']/SAMPLES:.2%})")
    print("-" * 40)
    print("Of the invalid configurations:")
    print(f"  - Hit the Hub:        {stats['hub_collisions']:>5}  ({stats['hub_collisions']/inv:.1%})")
    print(f"  - Hit Self (Same Arm):{stats['self_collisions']:>5}  ({stats['self_collisions']/inv:.1%})")
    print(f"  - Hit Neighbor Arm:   {stats['inter_arm_collisions']:>5}  ({stats['inter_arm_collisions']/inv:.1%})")
    print("-" * 40)
    print("Note: Percentages sum to >100% because one configuration")
    print("      can fail in multiple ways simultaneously.")

if __name__ == "__main__":
    run_failure_analysis()