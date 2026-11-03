-- 用户填写的参数样本，不能理解为真实设备或用户数量。
SELECT cpu_speedo, gpu_speedo, soc_speedo, ram_id, model,
       last_mode, last_goal, submission_count, first_seen_at, last_seen_at, last_app_version
FROM device_samples
ORDER BY last_seen_at DESC
LIMIT 100;

-- 规范化硬件参数组合数；接收次数不等于人数。
SELECT COUNT(*) AS distinct_parameter_sets,
       COALESCE(SUM(submission_count), 0) AS accepted_submissions
FROM device_samples;

-- 按内存 ID 汇总不同参数组合。
SELECT ram_id, model, COUNT(*) AS parameter_sets
FROM device_samples
GROUP BY ram_id, model
ORDER BY parameter_sets DESC, ram_id;
