declare type NewTaskBuilder = {
    links: string;
    filename: string;
    split?: number;
    storagePath?: string;
    userAgent?: string;
    cookie?: string;
    referer?: string;
    headers?: Array<{ key: string; value: string }>;
};